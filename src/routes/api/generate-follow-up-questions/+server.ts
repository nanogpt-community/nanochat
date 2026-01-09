import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { z } from 'zod/v4';
import { OpenAI } from 'openai';
import { db } from '$lib/db';
import { messages, userKeys, userSettings } from '$lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { Provider } from '$lib/types';
import { FOLLOW_UP_QUESTIONS_PROMPT } from '$lib/prompts/follow-up-questions';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

const MODEL = 'zai-org/GLM-4.5-Air';

const reqBodySchema = z.object({
	conversationId: z.string(),
	messageId: z.string(),
});

export type GenerateFollowUpQuestionsRequestBody = z.infer<typeof reqBodySchema>;

export type GenerateFollowUpQuestionsResponse = {
	ok: true;
	suggestions: string[];
};

function response({ suggestions }: { suggestions: string[] }) {
	return json({ ok: true, suggestions });
}

export const POST: RequestHandler = async ({ request }) => {
	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		return error(400, 'Failed to parse request body');
	}

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		return error(400, parsed.error);
	}
	const args = parsed.data;

	const userId = await getAuthenticatedUserId(request);

	const keyRecord = await db.query.userKeys.findFirst({
		where: and(eq(userKeys.userId, userId), eq(userKeys.provider, Provider.NanoGPT)),
	});

	let apiKey = keyRecord?.key;
	if (apiKey && isEncrypted(apiKey)) {
		apiKey = decryptApiKey(apiKey);
	}
	if (!apiKey && process.env.NANOGPT_API_KEY) {
		apiKey = process.env.NANOGPT_API_KEY;
	}

	if (!apiKey) {
		return error(403, 'NanoGPT API key required');
	}

	const userSettingsData = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
	});

	const modelId = userSettingsData?.followUpModelId || MODEL;

	const targetMessage = await db.query.messages.findFirst({
		where: eq(messages.id, args.messageId),
	});

	if (!targetMessage) {
		return error(404, 'Message not found');
	}

	if (targetMessage.role !== 'assistant' || targetMessage.content.length <= 100) {
		console.log('[follow-up] Skipped: not an assistant message or too short');
		return response({ suggestions: [] });
	}

	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, args.conversationId),
		orderBy: [desc(messages.createdAt)],
		limit: 2,
	});

	const userMessage = conversationMessages.find((m) => m.role === 'user')?.content ?? '';

	const prompt = FOLLOW_UP_QUESTIONS_PROMPT(userMessage, targetMessage.content);

	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey: apiKey,
	});

	const suggestionsResult = await ResultAsync.fromPromise(
		openai.chat.completions.create({
			model: modelId,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.7,
		}),
		(e) => `Follow-up questions API call failed: ${e}`
	);

	if (suggestionsResult.isErr()) {
		console.error('[follow-up] Failed to generate suggestions:', suggestionsResult.error);
		return response({ suggestions: [] });
	}

	const suggestionsResponse = suggestionsResult.value;
	const rawSuggestions = suggestionsResponse.choices[0]?.message?.content?.trim();

	if (!rawSuggestions) {
		console.log('[follow-up] No suggestions generated');
		return response({ suggestions: [] });
	}

	let suggestions: string[] = [];
	try {
		suggestions = JSON.parse(rawSuggestions);

		if (!Array.isArray(suggestions) || suggestions.some((s) => typeof s !== 'string')) {
			throw new Error('Invalid response format');
		}

		suggestions = suggestions.slice(0, 3);
	} catch (e) {
		console.error('[follow-up] Failed to parse suggestions:', e);
		return response({ suggestions: [] });
	}

	await db
		.update(messages)
		.set({ followUpSuggestions: suggestions })
		.where(eq(messages.id, args.messageId));

	console.log(
		`[follow-up] Generated ${suggestions.length} suggestions for message ${args.messageId}`
	);

	return response({ suggestions });
};
