import OpenAI from 'openai';
import { db, generateId } from '$lib/db';
import { conversations, messages, modelPerformanceStats, type UserSettings } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import { Provider } from '$lib/types';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { DEFAULT_BACKGROUND_MODEL } from '$lib/backend/default-models';
import { FOLLOW_UP_QUESTIONS_PROMPT } from '$lib/prompts/follow-up-questions';
import type { Log } from './schema';

export function isAbortError(error: unknown): boolean {
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
	return (
		message.includes('aborterror') ||
		message.includes('request was aborted') ||
		message.includes('cancelled by user') ||
		(message.includes('aborted') && message.includes('request'))
	);
}

export async function handleGenerationError(opts: {
	error: string;
	conversationId: string;
	messageId: string | undefined;
	log: Log;
}): Promise<void> {
	opts.log(`Error: ${opts.error}`);
	if (opts.messageId) {
		await db.update(messages).set({ error: opts.error }).where(eq(messages.id, opts.messageId));
	}
	await db
		.update(conversations)
		.set({ generating: false })
		.where(eq(conversations.id, opts.conversationId));
}

export async function handleGenerationAbort(opts: {
	conversationId: string;
	log: Log;
}): Promise<void> {
	opts.log('Generation aborted');
	await db
		.update(conversations)
		.set({ generating: false })
		.where(eq(conversations.id, opts.conversationId));
}

function backgroundClient(apiKey: string, providerId: string | null | undefined): OpenAI {
	return new OpenAI({
		baseURL: nanoGptUrl('/api/v1'),
		apiKey,
		defaultHeaders: providerId ? { 'X-Provider': providerId } : undefined,
	});
}

/** Names a "New Chat" from its first exchange. Returns the title, or null if skipped/failed. */
export async function generateConversationTitle(opts: {
	conversationId: string;
	userId: string;
	apiKey: string;
	userMessage: string;
	assistantMessage: string;
	userSettingsData: UserSettings | null;
	log: Log;
}): Promise<string | null> {
	const { log } = opts;
	const conversation = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, opts.conversationId), eq(conversations.userId, opts.userId)),
		columns: { title: true },
	});
	if (!conversation) {
		log('Title generation: Conversation not found');
		return null;
	}
	if (conversation.title !== 'New Chat') return null;

	const openai = backgroundClient(opts.apiKey, opts.userSettingsData?.titleProviderId);
	const prompt = `Summarize this conversation into a 3-5 word title that captures the core topic.

User: """${opts.userMessage}"""
Assistant: """${opts.assistantMessage}"""

Requirements:
- Use title case
- No punctuation at the end
- Return only the title text
- For casual greetings: "Greeting"
- Focus on the main subject/question
`;

	const result = await ResultAsync.fromPromise(
		openai.chat.completions.create({
			model: opts.userSettingsData?.titleModelId || DEFAULT_BACKGROUND_MODEL,
			messages: [{ role: 'user', content: prompt }],
			max_tokens: 20,
			temperature: 0.5,
		}),
		(e) => `Title generation API call failed: ${e}`
	);
	if (result.isErr()) {
		log(`Title generation: ${result.error}`);
		return null;
	}

	const raw = result.value.choices[0]?.message?.content?.trim();
	if (!raw) return null;
	const title = raw.replace(/^["']|["']$/g, '');

	await db
		.update(conversations)
		.set({ title, updatedAt: new Date() })
		.where(eq(conversations.id, opts.conversationId));
	log(`Title generation: "${title}"`);
	return title;
}

export async function generateFollowUpSuggestions(opts: {
	conversationId: string;
	assistantMessageId: string;
	apiKey: string;
	userMessage: string;
	assistantMessage: string;
	userSettingsData: UserSettings | null;
	log: Log;
}): Promise<string[] | null> {
	const { log } = opts;
	if (opts.userSettingsData?.followUpQuestionsEnabled === false) return null;
	if (opts.assistantMessage.length <= 100) return null;

	const openai = backgroundClient(opts.apiKey, opts.userSettingsData?.followUpProviderId);
	const result = await ResultAsync.fromPromise(
		openai.chat.completions.create({
			model: opts.userSettingsData?.followUpModelId || DEFAULT_BACKGROUND_MODEL,
			messages: [
				{
					role: 'user',
					content: FOLLOW_UP_QUESTIONS_PROMPT(opts.userMessage, opts.assistantMessage),
				},
			],
			temperature: 0.7,
		}),
		(e) => `Follow-up questions API call failed: ${e}`
	);
	if (result.isErr()) {
		log(`Follow-up generation: ${result.error}`);
		return null;
	}

	const raw = result.value.choices[0]?.message?.content?.trim();
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
			throw new Error('Invalid response format');
		}
		const suggestions = parsed.slice(0, 3) as string[];
		await db
			.update(messages)
			.set({ followUpSuggestions: suggestions })
			.where(
				and(
					eq(messages.id, opts.assistantMessageId),
					eq(messages.conversationId, opts.conversationId)
				)
			);
		log(`Follow-up generation: ${suggestions.length} suggestions`);
		return suggestions;
	} catch (e) {
		log(`Follow-up generation: failed to parse suggestions: ${e}`);
		return null;
	}
}

/** Per-user, per-model running averages for the analytics page. */
export async function recordModelStats(opts: {
	userId: string;
	modelId: string;
	tokenCount: number | undefined;
	costUsd: number | undefined;
	responseTimeMs: number;
	log: Log;
}): Promise<void> {
	const { tokenCount, costUsd, responseTimeMs } = opts;
	if (tokenCount === undefined || costUsd === undefined) return;
	try {
		const existing = await db.query.modelPerformanceStats.findFirst({
			where: and(
				eq(modelPerformanceStats.userId, opts.userId),
				eq(modelPerformanceStats.modelId, opts.modelId),
				eq(modelPerformanceStats.provider, Provider.NanoGPT)
			),
		});

		if (existing) {
			const total = existing.totalMessages + 1;
			await db
				.update(modelPerformanceStats)
				.set({
					totalMessages: total,
					totalCost: existing.totalCost + costUsd,
					avgTokens: existing.avgTokens
						? (existing.avgTokens * existing.totalMessages + tokenCount) / total
						: tokenCount,
					avgResponseTime: existing.avgResponseTime
						? (existing.avgResponseTime * existing.totalMessages + responseTimeMs) / total
						: existing.avgResponseTime,
					lastUpdated: new Date(),
				})
				.where(eq(modelPerformanceStats.id, existing.id));
		} else {
			await db.insert(modelPerformanceStats).values({
				id: generateId(),
				userId: opts.userId,
				modelId: opts.modelId,
				provider: Provider.NanoGPT,
				totalMessages: 1,
				totalCost: costUsd,
				avgTokens: tokenCount,
				avgResponseTime: responseTimeMs,
				errorCount: 0,
				thumbsUpCount: 0,
				thumbsDownCount: 0,
				regenerateCount: 0,
				accurateCount: 0,
				helpfulCount: 0,
				creativeCount: 0,
				fastCount: 0,
				costEffectiveCount: 0,
				lastUpdated: new Date(),
			});
		}
	} catch (e) {
		opts.log(`[analytics] Error updating stats: ${e}`);
	}
}
