import OpenAI from 'openai';
import { error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { conversations, messages } from '$lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { resolveNanoGptApiKey } from '$lib/backend/nanogpt-key.server';
import { computeTokenCost } from '$lib/backend/pricing';
import { getUserSettings } from '$lib/db/queries/user-settings';
import { DEFAULT_BACKGROUND_MODEL } from '$lib/backend/default-models';
import { assertSharedKeyUse } from '$lib/backend/shared-key-policy';

/** Messages kept verbatim after an auto-compaction: the new user message plus two prior exchanges. */
export const KEEP_TAIL = 5;
/** A manual compaction keeps only the last exchange. */
export const MANUAL_KEEP_TAIL = 2;
const SUMMARY_MAX_TOKENS = 4000;
const IMAGE_TOKEN_ESTIMATE = 1000;
/** Used for the transcript budget when the catalog doesn't report a context length. */
const FALLBACK_CONTEXT_LENGTH = 128_000;

type Part = { type: string; text?: string };
export type PromptMessage = { role: string; content: string | Part[] };

// ponytail: chars/4 heuristic; the provider-reported prompt size overrides it when known
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function messageText(m: PromptMessage): string {
	if (typeof m.content === 'string') return m.content;
	return m.content
		.map((p) => p.text ?? '')
		.filter(Boolean)
		.join('\n');
}

export function estimateMessagesTokens(msgs: PromptMessage[]): number {
	let total = 0;
	for (const m of msgs) {
		total += estimateTokens(messageText(m)) + 4;
		if (Array.isArray(m.content)) {
			total += m.content.filter((p) => p.type === 'image_url').length * IMAGE_TOKEN_ESTIMATE;
		}
	}
	return total;
}

/** Pure decision: which messages (by index) to summarize, given the budget. Returns null if none. */
export function planCompaction(opts: {
	startIndex: number;
	messageCount: number;
	usedTokens: number;
	contextLength: number;
	thresholdPercent: number;
	force?: boolean;
	keepTail?: number;
}): { from: number; to: number } | null {
	const { startIndex, messageCount, usedTokens, contextLength, thresholdPercent } = opts;
	if (!opts.force && usedTokens <= (contextLength * thresholdPercent) / 100) return null;
	const to = messageCount - (opts.keepTail ?? KEEP_TAIL); // exclusive
	if (to <= startIndex) return null;
	return { from: startIndex, to };
}

export async function getModelContextLength(modelId: string): Promise<number | null> {
	const models = await getNanoGPTModels();
	if (models.isErr()) return null;
	return models.value.find((m) => m.id === modelId)?.context_length ?? null;
}

export function formatSummaryForPrompt(summary: string): string {
	return `[CONVERSATION SUMMARY]
Earlier messages in this conversation were compacted. This summary replaces them; treat it as ground truth for what was discussed.
${summary}

`;
}

function buildTranscript(msgs: PromptMessage[], budgetChars: number): string {
	// ponytail: per-message cap so the summarizer request itself fits; a smarter
	// approach would summarize in chunks.
	const cap = Math.max(500, Math.floor(budgetChars / Math.max(1, msgs.length)));
	return msgs
		.map((m) => {
			const text = messageText(m);
			const body = text.length > cap ? `${text.slice(0, cap)}\n[...truncated]` : text;
			return `${m.role.toUpperCase()}:\n${body}`;
		})
		.join('\n\n');
}

export type CompactionResult = {
	summary: string | null;
	startIndex: number;
	compacted: boolean;
};

/**
 * If the prompt exceeds the threshold (or `force` is set), summarize everything
 * except the recent tail, persist the summary on the conversation, and return
 * where the live history starts. The summary call's cost is added to the conversation.
 */
export async function compactIfNeeded(opts: {
	conversation: {
		id: string;
		compactionSummary: string | null;
		compactedThroughMessageId: string | null;
	};
	messageIds: string[];
	messages: PromptMessage[];
	systemTokens: number;
	/** Provider-reported prompt size of a past assistant message; more accurate than the heuristic. */
	knownPromptTokens?: { messageIndex: number; tokens: number };
	enabled: boolean;
	thresholdPercent: number;
	force?: boolean;
	keepTail?: number;
	modelId: string;
	providerId?: string | null;
	apiKey: string;
	openai: OpenAI;
	log: (msg: string) => void;
}): Promise<CompactionResult> {
	const { conversation, messageIds, messages: msgs } = opts;

	const anchor = conversation.compactedThroughMessageId
		? messageIds.indexOf(conversation.compactedThroughMessageId)
		: -1;
	// Anchor missing (message deleted/edited away): fall back to full history; the
	// next compaction rebuilds the summary from scratch.
	let summary = anchor >= 0 ? conversation.compactionSummary : null;
	let startIndex = anchor + 1;
	const unchanged = { summary, startIndex, compacted: false };

	if (!opts.enabled) return unchanged;

	const contextLength =
		(await getModelContextLength(opts.modelId)) ?? (opts.force ? FALLBACK_CONTEXT_LENGTH : null);
	if (!contextLength) return unchanged;

	// The reported prompt for a past reply covered everything before that message,
	// so only what came after needs estimating.
	const known = opts.knownPromptTokens;
	const usedTokens =
		known && known.messageIndex >= startIndex
			? known.tokens + estimateMessagesTokens(msgs.slice(known.messageIndex))
			: opts.systemTokens +
				(summary ? estimateTokens(summary) : 0) +
				estimateMessagesTokens(msgs.slice(startIndex));

	const plan = planCompaction({
		startIndex,
		messageCount: msgs.length,
		usedTokens,
		contextLength,
		thresholdPercent: opts.thresholdPercent,
		force: opts.force,
		keepTail: opts.keepTail,
	});
	if (!plan) return unchanged;

	opts.log(
		`Compacting: ~${usedTokens}/${contextLength} tokens, summarizing messages ${plan.from}..${plan.to - 1}`
	);

	const transcript = buildTranscript(
		msgs.slice(plan.from, plan.to),
		Math.floor(contextLength * 4 * 0.6)
	);
	const prompt = `${summary ? `Existing summary of even earlier messages:\n${summary}\n\n` : ''}Transcript to fold into the summary:\n\n${transcript}`;

	try {
		const res = await opts.openai.chat.completions.create({
			model: opts.modelId,
			messages: [
				{
					role: 'system',
					content: `You compress a conversation so an assistant can continue it seamlessly after the original messages are dropped.
Write a dense summary that preserves: the user's goals and constraints, decisions made, key facts, names, numbers, code or file identifiers, open questions, and the current state of any task. Merge the existing summary (if given) with the transcript. Use plain prose and bullet points, no preamble.`,
				},
				{ role: 'user', content: prompt },
			],
			temperature: 0.2,
			max_tokens: SUMMARY_MAX_TOKENS,
		});
		const text = res.choices[0]?.message?.content?.trim();
		if (!text) throw new Error('empty summary');

		summary = text;
		startIndex = plan.to;

		const cost = res.usage
			? await computeTokenCost({
					modelId: opts.modelId,
					providerId: opts.providerId,
					apiKey: opts.apiKey,
					promptTokens: res.usage.prompt_tokens ?? 0,
					completionTokens: res.usage.completion_tokens ?? 0,
				})
			: undefined;

		await db
			.update(conversations)
			.set({
				compactionSummary: summary,
				compactedThroughMessageId: messageIds[plan.to - 1],
				costUsd: sql`COALESCE(${conversations.costUsd}, 0) + ${cost ?? 0}`,
			})
			.where(eq(conversations.id, conversation.id));
		opts.log(
			`Compaction stored (${summary.length} chars, $${(cost ?? 0).toFixed(6)}), live history starts at ${startIndex}`
		);
		return { summary, startIndex, compacted: true };
	} catch (e) {
		opts.log(`Compaction failed, sending full history: ${e}`);
		return unchanged;
	}
}

/** User-triggered compaction of an idle conversation, regardless of size. */
export async function compactConversationNow(
	conversationId: string,
	userId: string
): Promise<{
	compacted: boolean;
	summary: string | null;
	compactedThroughMessageId: string | null;
}> {
	const conversation = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
	});
	if (!conversation) throw error(404, 'Conversation not found');
	if (conversation.generating) throw error(409, 'Wait for the current reply to finish');

	const key = await resolveNanoGptApiKey(userId);
	if (!key) throw error(403, 'No NanoGPT API key available');

	const [rows, settings] = await Promise.all([
		db.query.messages.findMany({
			where: eq(messages.conversationId, conversationId),
			columns: { id: true, role: true, content: true, modelId: true },
			orderBy: [asc(messages.createdAt)],
		}),
		getUserSettings(userId),
	]);

	// Summarize with whatever the chat last used; it's the model that has been
	// reading this conversation anyway.
	const modelId =
		rows.findLast((m) => m.role === 'assistant' && m.modelId)?.modelId ??
		settings?.memoryModelId ??
		DEFAULT_BACKGROUND_MODEL;
	await assertSharedKeyUse({ userId, usingServerKey: key.usingServerKey, modelId });

	const result = await compactIfNeeded({
		conversation,
		messageIds: rows.map((m) => m.id),
		messages: rows.map((m) => ({ role: m.role, content: m.content })),
		systemTokens: 0,
		enabled: true,
		thresholdPercent: 0,
		force: true,
		keepTail: MANUAL_KEEP_TAIL,
		modelId,
		apiKey: key.apiKey,
		openai: new OpenAI({ baseURL: nanoGptUrl('/api/v1'), apiKey: key.apiKey }),
		log: (m) => console.log(`[compact] ${m}`),
	});

	return {
		compacted: result.compacted,
		summary: result.summary,
		compactedThroughMessageId: result.compacted
			? (rows[result.startIndex - 1]?.id ?? null)
			: conversation.compactedThroughMessageId,
	};
}
