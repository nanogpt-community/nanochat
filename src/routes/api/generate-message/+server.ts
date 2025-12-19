
import type { Doc } from '$lib/db/types';
import { db, generateId } from '$lib/db';
import {
	userEnabledModels,
	userKeys,
	userRules,
	userSettings,
	conversations,
	messages,
	storage,
} from '$lib/db/schema';
import { readFileSync } from 'fs';
import { eq, and, asc, sql } from 'drizzle-orm';
import { auth } from '$lib/auth';
import { Provider, type Annotation } from '$lib/types';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { err, ok, Result, ResultAsync } from 'neverthrow';
import OpenAI from 'openai';
import { z } from 'zod/v4';
import { generationAbortControllers } from './cache.js';
import { md } from '$lib/utils/markdown-it.js';
import * as array from '$lib/utils/array';
import { parseMessageForRules } from '$lib/utils/rules.js';
import { performNanoGPTWebSearch } from '$lib/backend/web-search';
import { scrapeUrlsFromMessage } from '$lib/backend/url-scraper';
import { getUserMemory, upsertUserMemory } from '$lib/db/queries/user-memories';

// Set to true to enable debug logging
const ENABLE_LOGGING = true;

const reqBodySchema = z
	.object({
		message: z.string().optional(),
		model_id: z.string(),

		session_token: z.string(),
		conversation_id: z.string().optional(),
		web_search_enabled: z.boolean().optional(),
		images: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
				})
			)
			.optional(),
		reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
	})
	.refine(
		(data) => {
			if (data.conversation_id === undefined && data.message === undefined) return false;

			return true;
		},
		{
			message: 'You must provide a message when creating a new conversation',
		}
	);

export type GenerateMessageRequestBody = z.infer<typeof reqBodySchema>;

export type GenerateMessageResponse = {
	ok: true;
	conversation_id: string;
};

function response(res: GenerateMessageResponse) {
	return json(res);
}

function log(message: string, startTime: number): void {
	if (!ENABLE_LOGGING) return;
	const elapsed = Date.now() - startTime;
	console.log(`[GenerateMessage] ${message} (${elapsed}ms)`);
}

// Helper to get user ID from session token
async function getUserIdFromSession(
	sessionToken: string
): Promise<Result<string, string>> {
	try {
		// Query the session table to get user ID
		const session = await db.query.session.findFirst({
			where: (sessions, { eq }) => eq(sessions.token, sessionToken),
		});
		if (!session) {
			return err('Session not found');
		}
		return ok(session.userId);
	} catch (e) {
		return err(`Failed to get user from session: ${e}`);
	}
}

async function generateConversationTitle({
	conversationId,
	userId,
	startTime,
	apiKey,
	userMessage,
}: {
	conversationId: string;
	userId: string;
	startTime: number;
	apiKey: string;
	userMessage: string;
}) {
	log('Starting conversation title generation', startTime);

	// Only generate title if conversation currently has default title
	const conversation = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
	});

	if (!conversation) {
		log('Title generation: Conversation not found', startTime);
		return;
	}

	// If title is already customized (not "New Chat"), skip
	if (conversation.title !== 'New Chat') {
		log('Title generation: Conversation already has custom title', startTime);
		return;
	}

	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey,
	});

	// Create a prompt for title generation using only the first user message
	const titlePrompt = `Based on this message:
"""${userMessage}"""

Generate a concise, specific title (max 4-5 words).
Generate only the title based on the message, nothing else. Don't name the title 'Generate Title' or anything stupid like that, otherwise its obvious we're generating a title with AI.

Also, do not interact with the message directly or answer it. Just generate the title based on the message.

If its a simple hi, just name it "Greeting" or something like that.
`;

	const titleResult = await ResultAsync.fromPromise(
		openai.chat.completions.create({
			model: 'zai-org/GLM-4.5-Air',
			messages: [{ role: 'user', content: titlePrompt }],
			max_tokens: 20,
			temperature: 0.5,
		}),
		(e) => `Title generation API call failed: ${e}`
	);

	if (titleResult.isErr()) {
		log(`Title generation: OpenAI call failed: ${titleResult.error}`, startTime);
		return;
	}

	const titleResponse = titleResult.value;
	const rawTitle = titleResponse.choices[0]?.message?.content?.trim();

	if (!rawTitle) {
		log('Title generation: No title generated', startTime);
		return;
	}

	// Strip surrounding quotes if present
	const generatedTitle = rawTitle.replace(/^["']|["']$/g, '');

	// Update the conversation title
	await db
		.update(conversations)
		.set({ title: generatedTitle, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	log(`Title generation: Successfully updated title to "${generatedTitle}"`, startTime);
}

async function generateAIResponse({
	conversationId,
	userId,
	startTime,
	model,
	apiKey,
	rules,
	userSettingsData,
	abortSignal,
	reasoningEffort,
}: {
	conversationId: string;
	userId: string;
	startTime: number;
	apiKey: string;
	model: Doc<'user_enabled_models'>;
	rules: Doc<'user_rules'>[];
	userSettingsData: Doc<'user_settings'> | null;
	abortSignal?: AbortSignal;
	reasoningEffort?: 'low' | 'medium' | 'high';
}) {
	log('Starting AI response generation in background', startTime);

	if (abortSignal?.aborted) {
		log('AI response generation aborted before starting', startTime);
		return;
	}

	// Get all messages for this conversation
	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [asc(messages.createdAt)],
	});

	log(`Background: Retrieved ${conversationMessages.length} messages from conversation`, startTime);

	// Check if web search is enabled for the last user message
	const lastUserMessage = conversationMessages.filter((m) => m.role === 'user').pop();
	const webSearchEnabled = lastUserMessage?.webSearchEnabled ?? false;

	const modelId = model.modelId;

	// Fetch persistent memory if enabled
	let storedMemory: string | null = null;
	if (userSettingsData?.persistentMemoryEnabled) {
		log('Background: Fetching persistent memory', startTime);
		try {
			const memory = await getUserMemory(userId);
			if (memory?.content) {
				storedMemory = memory.content;
				log(`Background: Persistent memory loaded (${memory.content.length} chars)`, startTime);
			}
		} catch (e) {
			log(`Background: Failed to fetch persistent memory: ${e}`, startTime);
		}
	}

	// Perform web search if enabled
	let searchContext: string | null = null;
	if (webSearchEnabled && lastUserMessage) {
		log('Background: Performing web search', startTime);
		try {
			searchContext = await performNanoGPTWebSearch(lastUserMessage.content, apiKey);
			log('Background: Web search completed', startTime);
		} catch (e) {
			log(`Background: Web search failed: ${e}`, startTime);
		}
	}

	// Scrape URLs from the user message if any are present
	let scrapedContent: string = '';
	if (lastUserMessage) {
		log('Background: Checking for URLs to scrape', startTime);
		try {
			scrapedContent = await scrapeUrlsFromMessage(lastUserMessage.content, apiKey);
			if (scrapedContent) {
				log('Background: URL scraping completed', startTime);
			}
		} catch (e) {
			log(`Background: URL scraping failed: ${e}`, startTime);
		}
	}

	// Create assistant message
	const assistantMessageId = generateId();
	const now = new Date();

	await db.insert(messages).values({
		id: assistantMessageId,
		conversationId,
		modelId: model.modelId,
		provider: Provider.NanoGPT,
		content: '',
		role: 'assistant',
		webSearchEnabled,
		createdAt: now,
	});

	log('Background: Assistant message created', startTime);

	const userMessage = conversationMessages[conversationMessages.length - 1];

	if (!userMessage) {
		await handleGenerationError({
			error: 'No user message found',
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		return;
	}

	let attachedRules = rules.filter((r) => r.attach === 'always');

	for (const message of conversationMessages) {
		const parsedRules = parseMessageForRules(
			message.content,
			rules.filter((r) => r.attach === 'manual')
		);

		attachedRules.push(...parsedRules);
	}

	// remove duplicates
	attachedRules = array.fromMap(
		array.toMap(attachedRules, (r) => [r.id, r]),
		(_k, v) => v
	);

	log(`Background: ${attachedRules.length} rules attached`, startTime);

	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey,
	});

	const formattedMessages = await Promise.all(
		conversationMessages.map(async (m) => {
			const messageImages = m.images as Array<{
				url: string;
				storage_id: string;
				fileName?: string;
			}> | null;
			if (messageImages && messageImages.length > 0 && m.role === 'user') {
				const processedImages = await Promise.all(
					messageImages.map(async (img) => {
						// If it's already a data URL or http url, return as is (though http might fail if localhost)
						if (img.url.startsWith('data:') || img.url.startsWith('http')) {
							return {
								type: 'image_url' as const,
								image_url: { url: img.url },
							};
						}

						// Look up storage record
						const storageRecord = await db.query.storage.findFirst({
							where: eq(storage.id, img.storage_id),
						});

						if (!storageRecord) {
							console.warn(`Storage record not found for id: ${img.storage_id}`);
							return {
								type: 'image_url' as const,
								image_url: { url: img.url }, // Fallback to original URL
							};
						}

						try {
							const fileBuffer = readFileSync(storageRecord.path);
							const base64 = fileBuffer.toString('base64');
							const dataUrl = `data:${storageRecord.mimeType};base64,${base64}`;

							return {
								type: 'image_url' as const,
								image_url: { url: dataUrl },
							};
						} catch (e) {
							console.error(`Failed to read file for image ${img.storage_id}:`, e);
							return {
								type: 'image_url' as const,
								image_url: { url: img.url }, // Fallback
							};
						}
					})
				);

				return {
					role: 'user' as const,
					content: [{ type: 'text' as const, text: m.content }, ...processedImages],
				};
			}
			return {
				role: m.role as 'user' | 'assistant' | 'system',
				content: m.content,
			};
		})
	);

	// Construct system message content
	let systemContent = '';

	// Add persistent memory context first (if available)
	if (storedMemory) {
		systemContent += `[MEMORY FROM PREVIOUS CONVERSATIONS]\n${storedMemory}\n\n[CURRENT CONVERSATION]\n`;
	}

	// Add scraped URL content (if any)
	if (scrapedContent) {
		systemContent += scrapedContent;
	}

	if (searchContext) {
		systemContent += `${searchContext}\n\nInstructions: Use the above search results to answer the user's query. Cite your sources where possible. If the results are not relevant, you can ignore them.\n\n`;
	}

	if (attachedRules.length > 0) {
		systemContent += `The user has mentioned one or more rules to follow with the @<rule_name> syntax. Please follow these rules as they apply.
Rules to follow:
${attachedRules.map((r) => `- ${r.name}: ${r.rule}`).join('\n')}`;
	}

	// Apply context memory compression if enabled
	let finalMessages = formattedMessages;
	if (userSettingsData?.contextMemoryEnabled && formattedMessages.length > 4) {
		log('Background: Applying context memory compression', startTime);
		try {
			const memoryResponse = await fetch('https://nano-gpt.com/api/v1/memory', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					messages: formattedMessages.map(m => ({
						role: m.role,
						content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
					})),
					expiration_days: 30,
				}),
			});

			if (memoryResponse.ok) {
				const memoryData = await memoryResponse.json();
				if (memoryData.messages && Array.isArray(memoryData.messages)) {
					finalMessages = memoryData.messages;
					log(`Background: Context memory compression applied, reduced to ${finalMessages.length} messages`, startTime);
				}
			} else {
				log(`Background: Context memory API returned ${memoryResponse.status}, using original messages`, startTime);
			}
		} catch (e) {
			log(`Background: Context memory compression failed: ${e}, using original messages`, startTime);
		}
	}

	// Only include system message if there is content
	const messagesToSend =
		systemContent.length > 0
			? [
				...finalMessages,
				{
					role: 'system' as const,
					content: systemContent,
				},
			]
			: finalMessages;

	if (abortSignal?.aborted) {
		await handleGenerationError({
			error: 'Cancelled by user',
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		return;
	}

	const streamResult = await ResultAsync.fromPromise(
		openai.chat.completions.create(
			{
				model: modelId,
				messages: messagesToSend,
				temperature: 0.7,
				stream: true,
				reasoning_effort: reasoningEffort,
			},
			{
				signal: abortSignal,
			}
		),
		(e) => `OpenAI API call failed: ${e}`
	);

	if (streamResult.isErr()) {
		await handleGenerationError({
			error: `Failed to create stream: ${streamResult.error}`,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		return;
	}

	const stream = streamResult.value;
	log('Background: OpenAI stream created successfully', startTime);

	let content = '';
	let reasoning = '';
	let chunkCount = 0;
	let generationId: string | null = null;
	const annotations: Annotation[] = [];

	try {
		for await (const chunk of stream) {
			if (abortSignal?.aborted) {
				log('AI response generation aborted during streaming', startTime);
				break;
			}

			chunkCount++;

			// @ts-expect-error you're wrong
			reasoning += chunk.choices[0]?.delta?.reasoning || '';
			content += chunk.choices[0]?.delta?.content || '';
			// @ts-expect-error you're wrong
			annotations.push(...(chunk.choices[0]?.delta?.annotations ?? []));

			if (!content && !reasoning) continue;

			generationId = chunk.id;

			// Update message content in database
			await db
				.update(messages)
				.set({
					content,
					reasoning: reasoning.length > 0 ? reasoning : null,
					generationId,
					annotations: annotations.length > 0 ? annotations : null,
					reasoningEffort,
				})
				.where(eq(messages.id, assistantMessageId));
		}

		log(
			`Background stream processing completed. Processed ${chunkCount} chunks, final content length: ${content.length}`,
			startTime
		);

		if (!generationId) {
			log('Background: No generation id found', startTime);
			return;
		}

		const contentHtmlResultPromise = ResultAsync.fromPromise(
			md.renderAsync(content),
			(e) => `Failed to render HTML: ${e}`
		);

		const generationStatsResult = await retryResult(
			() => getGenerationStats(generationId!, apiKey),
			{
				delay: 500,
				retries: 2,
				startTime,
				fnName: 'getGenerationStats',
			}
		);

		if (generationStatsResult.isErr()) {
			log(`Background: Failed to get generation stats: ${generationStatsResult.error}`, startTime);
		}

		// just default so we don't blow up
		const generationStats = generationStatsResult.unwrapOr({
			tokens_completion: undefined,
			total_cost: undefined,
		});

		log('Background: Got generation stats', startTime);

		const contentHtmlResult = await contentHtmlResultPromise;

		if (contentHtmlResult.isErr()) {
			log(`Background: Failed to render HTML: ${contentHtmlResult.error}`, startTime);
		}

		// Update message with final data
		await db
			.update(messages)
			.set({
				tokenCount: generationStats.tokens_completion,
				costUsd: generationStats.total_cost,
				generationId,
				contentHtml: contentHtmlResult.unwrapOr(null),
			})
			.where(eq(messages.id, assistantMessageId));

		// Update conversation generating status and cost
		await db
			.update(conversations)
			.set({
				generating: false,
				updatedAt: new Date(),
				costUsd: sql`${conversations.costUsd} + ${generationStats.total_cost ?? 0}`,
			})
			.where(eq(conversations.id, conversationId));

		// Update persistent memory if enabled
		if (userSettingsData?.persistentMemoryEnabled) {
			log('Background: Updating persistent memory', startTime);
			try {
				// Include the new messages in memory compression
				const allMessages = [
					...(storedMemory ? [{ role: 'system' as const, content: storedMemory }] : []),
					...formattedMessages.map(m => ({
						role: m.role as 'user' | 'assistant' | 'system',
						content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
					})),
					{ role: 'assistant' as const, content },
				];

				const memoryResponse = await fetch('https://nano-gpt.com/api/v1/memory', {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						messages: allMessages,
						expiration_days: 30,
					}),
				});

				if (memoryResponse.ok) {
					const memoryData = await memoryResponse.json();
					if (memoryData.messages?.[0]?.content) {
						const compressedMemory = memoryData.messages[0].content;
						await upsertUserMemory(userId, compressedMemory, memoryData.usage?.total_tokens);
						log(`Background: Persistent memory updated (${compressedMemory.length} chars)`, startTime);
					}
				} else {
					log(`Background: Memory API returned ${memoryResponse.status}`, startTime);
				}
			} catch (e) {
				log(`Background: Failed to update persistent memory: ${e}`, startTime);
			}
		}

		log('Background: Message and conversation updated', startTime);
	} catch (error) {
		await handleGenerationError({
			error: `Stream processing error: ${error}`,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
	} finally {
		// Clean up the cached AbortController
		generationAbortControllers.delete(conversationId);
		log('Background: Cleaned up abort controller', startTime);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	log('Starting message generation request', startTime);

	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		log(`Request body parsing failed: ${bodyResult.error}`, startTime);
		return error(400, 'Failed to parse request body');
	}

	log('Request body parsed successfully', startTime);

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		log(`Schema validation failed: ${parsed.error}`, startTime);
		return error(400, parsed.error);
	}
	const args = parsed.data;

	log('Schema validation passed', startTime);

	// Get user from session
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		log('No session found', startTime);
		return error(401, 'Unauthorized');
	}

	const userId = session.user.id;
	log('Session authenticated successfully', startTime);

	// Fetch model, API key, rules, and user settings in parallel
	const [modelRecord, keyRecord, rulesRecords, userSettingsRecord] = await Promise.all([
		db.query.userEnabledModels.findFirst({
			where: and(
				eq(userEnabledModels.userId, userId),
				eq(userEnabledModels.provider, Provider.NanoGPT),
				eq(userEnabledModels.modelId, args.model_id)
			),
		}),
		db.query.userKeys.findFirst({
			where: and(eq(userKeys.userId, userId), eq(userKeys.provider, Provider.NanoGPT)),
		}),
		db.query.userRules.findMany({
			where: eq(userRules.userId, userId),
		}),
		db.query.userSettings.findFirst({
			where: eq(userSettings.userId, userId),
		}),
	]);

	if (!modelRecord) {
		log('Model not found or not enabled', startTime);
		return error(400, 'Model not found or not enabled');
	}

	// Determine API key
	let actualKey: string;
	if (keyRecord?.key) {
		actualKey = keyRecord.key;
		log('Using user API key', startTime);
	} else if (process.env.NANOGPT_API_KEY) {
		actualKey = process.env.NANOGPT_API_KEY;
		log('Using global API key', startTime);
	} else {
		// NanoGPT requires an API key
		log('No NanoGPT API key found', startTime);
		return error(
			403,
			'No API key found. Please add your NanoGPT API key in Settings > Models to continue chatting.'
		);
	}

	let conversationId = args.conversation_id;
	if (!conversationId) {
		// technically zod should catch this but just in case
		if (args.message === undefined) {
			return error(400, 'You must provide a message when creating a new conversation');
		}

		// Create new conversation
		conversationId = generateId();
		const now = new Date();

		await db.insert(conversations).values({
			id: conversationId,
			userId,
			title: 'New Chat',
			generating: true,
			public: false,
			pinned: false,
			costUsd: 0,
			createdAt: now,
			updatedAt: now,
		});

		// Create user message
		const userMessageId = generateId();
		await db.insert(messages).values({
			id: userMessageId,
			conversationId,
			content: args.message,
			role: 'user',
			images: args.images ?? null,
			webSearchEnabled: args.web_search_enabled ?? false,
			createdAt: now,
		});

		log('New conversation and message created', startTime);

		// Generate title for new conversation in background
		generateConversationTitle({
			conversationId,
			userId,
			startTime,
			apiKey: actualKey,
			userMessage: args.message,
		}).catch((error) => {
			log(`Background title generation error: ${error}`, startTime);
		});
	} else {
		log('Using existing conversation', startTime);

		// Verify user owns conversation
		const existingConversation = await db.query.conversations.findFirst({
			where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
		});

		if (!existingConversation) {
			return error(403, 'Conversation not found or unauthorized');
		}

		if (args.message) {
			const userMessageId = generateId();
			await db.insert(messages).values({
				id: userMessageId,
				conversationId,
				content: args.message,
				role: 'user',
				modelId: args.model_id,
				reasoningEffort: args.reasoning_effort,
				images: args.images ?? null,
				webSearchEnabled: args.web_search_enabled ?? false,
				createdAt: new Date(),
			});

			log('User message created', startTime);
		}

		// Set generating status to true
		await db.update(conversations).set({ generating: true }).where(eq(conversations.id, conversationId));
	}

	// Create and cache AbortController for this generation
	const abortController = new AbortController();
	generationAbortControllers.set(conversationId, abortController);

	// Start AI response generation in background - don't await
	generateAIResponse({
		conversationId,
		userId,
		startTime,
		model: modelRecord,
		apiKey: actualKey,
		rules: rulesRecords,
		userSettingsData: userSettingsRecord ?? null,
		abortSignal: abortController.signal,
		reasoningEffort: args.reasoning_effort,
	})
		.catch(async (error) => {
			log(`Background AI response generation error: ${error}`, startTime);
			// Reset generating status on error
			try {
				await db.update(conversations).set({ generating: false }).where(eq(conversations.id, conversationId));
			} catch (e) {
				log(`Failed to reset generating status after error: ${e}`, startTime);
			}
		})
		.finally(() => {
			// Clean up the cached AbortController
			generationAbortControllers.delete(conversationId);
		});

	log('Response sent, AI generation started in background', startTime);
	return response({ ok: true, conversation_id: conversationId });
};

async function getGenerationStats(
	generationId: string,
	token: string
): Promise<Result<Data, string>> {
	try {
		const generation = await fetch(`https://nano-gpt.com/api/v1/generation?id=${generationId}`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const { data } = await generation.json();

		if (!data) {
			return err('No data returned from NanoGPT');
		}

		return ok(data);
	} catch {
		return err('Failed to get generation stats');
	}
}

async function retryResult<T, E>(
	fn: () => Promise<Result<T, E>>,
	{
		retries,
		delay,
		startTime,
		fnName,
	}: { retries: number; delay: number; startTime: number; fnName: string }
): Promise<Result<T, E>> {
	let attempts = 0;
	let lastResult: Result<T, E> | null = null;

	while (attempts <= retries) {
		lastResult = await fn();

		if (lastResult.isOk()) return lastResult;

		log(`Retrying ${fnName} ${attempts} failed: ${lastResult.error}`, startTime);

		await new Promise((resolve) => setTimeout(resolve, delay));
		attempts++;
	}

	if (!lastResult) throw new Error('This should never happen');

	return lastResult;
}

async function handleGenerationError({
	error,
	conversationId,
	messageId,
	startTime,
}: {
	error: string;
	conversationId: string;
	messageId: string | undefined;
	startTime: number;
}) {
	log(`Background: ${error}`, startTime);

	// Update message with error if we have a message ID
	if (messageId) {
		await db
			.update(messages)
			.set({ error })
			.where(eq(messages.id, messageId));
	}

	// Update conversation generating status
	await db.update(conversations).set({ generating: false }).where(eq(conversations.id, conversationId));

	log('Error updated', startTime);
}

export interface ApiResponse {
	data: Data;
}

export interface Data {
	created_at: string;
	model: string;
	app_id: string | null;
	external_user: string | null;
	streamed: boolean;
	cancelled: boolean;
	latency: number;
	moderation_latency: number | null;
	generation_time: number;
	tokens_prompt: number;
	tokens_completion: number;
	native_tokens_prompt: number;
	native_tokens_completion: number;
	native_tokens_reasoning: number;
	native_tokens_cached: number;
	num_media_prompt: number | null;
	num_media_completion: number | null;
	num_search_results: number | null;
	origin: string;
	is_byok: boolean;
	finish_reason: string;
	native_finish_reason: string;
	usage: number;
	id: string;
	upstream_id: string;
	total_cost: number;
	cache_discount: number | null;
	provider_name: string;
}
