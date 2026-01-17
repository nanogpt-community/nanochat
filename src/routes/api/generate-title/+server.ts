import { db } from '$lib/db';
import { conversations, messages, userSettings, userKeys } from '$lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { auth } from '$lib/auth';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import OpenAI from 'openai';
import { z } from 'zod/v4';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import { env } from '$env/dynamic/private';

const reqBodySchema = z.object({
	conversation_id: z.string(),
});

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const userId = session.user.id;

	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		return error(400, 'Failed to parse request body');
	}

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		return error(400, 'Invalid request body');
	}

	const { conversation_id: conversationId } = parsed.data;

	// Get the conversation
	const conversation = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
	});

	if (!conversation) {
		return error(404, 'Conversation not found');
	}

	// Only generate title if it's still "New Chat"
	if (conversation.title !== 'New Chat') {
		return json({ ok: true, title: conversation.title, skipped: true });
	}

	// Get user settings for title model preferences
	const userSettingsData = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
	});

	// Get API key
	let apiKey = env.NANOGPT_API_KEY;

	const userKeyRecord = await db.query.userKeys.findFirst({
		where: and(eq(userKeys.userId, userId), eq(userKeys.provider, 'nanogpt')),
	});

	if (userKeyRecord?.key) {
		const key = userKeyRecord.key;
		apiKey = isEncrypted(key) ? decryptApiKey(key) : key;
	}

	if (!apiKey) {
		return error(500, 'No API key available');
	}

	// Get conversation messages to build context for title
	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [asc(messages.createdAt)],
	});

	const userMessage = conversationMessages.find((m) => m.role === 'user')?.content || '';
	const assistantMessage =
		conversationMessages.find((m) => m.role === 'assistant')?.content || 'Generated content';

	// Generate title
	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey,
		defaultHeaders: userSettingsData?.titleProviderId
			? { 'X-Provider': userSettingsData.titleProviderId }
			: undefined,
	});

	const titlePrompt = `Summarize this conversation into a 3-5 word title that captures the core topic.

User: """${userMessage.slice(0, 500)}"""
Assistant: """${assistantMessage.slice(0, 500)}"""

Requirements:
- Use title case
- No punctuation at the end
- Return only the title text
- For casual greetings: "Greeting"
- Focus on the main subject/question
`;

	const titleResult = await ResultAsync.fromPromise(
		openai.chat.completions.create({
			model: userSettingsData?.titleModelId || 'zai-org/GLM-4.5-Air',
			messages: [{ role: 'user', content: titlePrompt }],
			max_tokens: 20,
			temperature: 0.5,
		}),
		(e) => `Title generation API call failed: ${e}`
	);

	if (titleResult.isErr()) {
		console.error('[generate-title] API call failed:', titleResult.error);
		return error(500, 'Failed to generate title');
	}

	const rawTitle = titleResult.value.choices[0]?.message?.content?.trim();

	if (!rawTitle) {
		return error(500, 'No title generated');
	}

	// Strip surrounding quotes if present
	const generatedTitle = rawTitle.replace(/^["']|["']$/g, '');

	// Update the conversation title
	await db
		.update(conversations)
		.set({ title: generatedTitle, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	return json({ ok: true, title: generatedTitle });
};
