import type OpenAI from 'openai';
import { db } from '$lib/db';
import { conversations } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';

/** Messages kept verbatim after a compaction: the new user message plus two prior exchanges. */
export const KEEP_TAIL = 5;
const SUMMARY_MAX_TOKENS = 4000;
const IMAGE_TOKEN_ESTIMATE = 1000;

type Part = { type: string; text?: string };
export type PromptMessage = { role: string; content: string | Part[] };

// ponytail: chars/4 heuristic; swap for a tokenizer if compaction fires too early/late
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function messageText(m: PromptMessage): string {
	if (typeof m.content === 'string') return m.content;
	return m.content.map((p) => p.text ?? '').filter(Boolean).join('\n');
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
}): { from: number; to: number } | null {
	const { startIndex, messageCount, usedTokens, contextLength, thresholdPercent } = opts;
	if (usedTokens <= (contextLength * thresholdPercent) / 100) return null;
	const to = messageCount - KEEP_TAIL; // exclusive
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

/**
 * If the prompt exceeds the threshold, summarize everything except the recent tail,
 * persist the summary on the conversation, and return where the live history starts.
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
	enabled: boolean;
	thresholdPercent: number;
	modelId: string;
	openai: OpenAI;
	log: (msg: string) => void;
}): Promise<{ summary: string | null; startIndex: number }> {
	const { conversation, messageIds, messages } = opts;

	const anchor = conversation.compactedThroughMessageId
		? messageIds.indexOf(conversation.compactedThroughMessageId)
		: -1;
	// Anchor missing (message deleted/edited away): fall back to full history; the
	// next compaction rebuilds the summary from scratch.
	let summary = anchor >= 0 ? conversation.compactionSummary : null;
	let startIndex = anchor + 1;

	if (!opts.enabled) return { summary, startIndex };

	const contextLength = await getModelContextLength(opts.modelId);
	if (!contextLength) return { summary, startIndex };

	const usedTokens =
		opts.systemTokens +
		(summary ? estimateTokens(summary) : 0) +
		estimateMessagesTokens(messages.slice(startIndex));

	const plan = planCompaction({
		startIndex,
		messageCount: messages.length,
		usedTokens,
		contextLength,
		thresholdPercent: opts.thresholdPercent,
	});
	if (!plan) return { summary, startIndex };

	opts.log(
		`Compacting: ~${usedTokens}/${contextLength} tokens, summarizing messages ${plan.from}..${plan.to - 1}`
	);

	const transcript = buildTranscript(
		messages.slice(plan.from, plan.to),
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
		await db
			.update(conversations)
			.set({ compactionSummary: summary, compactedThroughMessageId: messageIds[plan.to - 1] })
			.where(eq(conversations.id, conversation.id));
		opts.log(`Compaction stored (${summary.length} chars), live history starts at ${startIndex}`);
	} catch (e) {
		opts.log(`Compaction failed, sending full history: ${e}`);
	}

	return { summary, startIndex };
}
