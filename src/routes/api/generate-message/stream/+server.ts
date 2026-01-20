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
	assistants,
	projects,
	apiKeys,
	user,
	modelPerformanceStats,
} from '$lib/db/schema';
import { existsSync, readFileSync } from 'fs';
import { extractTextFromPDF } from '$lib/utils/pdf-extraction';
import { extractTextFromEPUB } from '$lib/utils/epub-extraction';
import { eq, and, asc, sql } from 'drizzle-orm';
import { auth } from '$lib/auth';
import { Provider, type Annotation } from '$lib/types';
import { error, type RequestHandler } from '@sveltejs/kit';
import { Result, ResultAsync, ok, err } from 'neverthrow';
import OpenAI from 'openai';
import { z } from 'zod/v4';
import { generationAbortControllers } from '../cache.js';
import { md } from '$lib/utils/markdown-it.js';
import * as array from '$lib/utils/array';
import { parseMessageForRules } from '$lib/utils/rules.js';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';
import { getUserMemory, upsertUserMemory } from '$lib/db/queries/user-memories';
import { extractUrlsByType, scrapeUrls, formatScrapedContent } from '$lib/backend/url-scraper';
import { supportsVideo } from '$lib/utils/model-capabilities';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import {
	checkAndUpdateDailyLimit,
	isWebDisabledForServerKey,
	isSubscriptionOnlyMode,
} from '$lib/backend/message-limits';
import { substituteSystemPromptVariables } from '$lib/utils/system-prompt-variables';
import { mcpToolDefinitions, executeMcpTool, isMcpAvailable } from '$lib/backend/mcp-tools';
import { SSEEncoder, sseHeaders } from '$lib/sse';

// Set to true to enable debug logging
const ENABLE_LOGGING = true;

const reqBodySchema = z
	.object({
		message: z.string().optional(),
		model_id: z.string(),
		assistant_id: z.string().optional(),
		project_id: z.string().optional(),

		session_token: z.string().optional(),
		conversation_id: z.string().optional(),
		web_search_enabled: z.boolean().optional(),
		web_search_mode: z.enum(['off', 'standard', 'deep']).optional(),
		web_search_provider: z
			.enum(['linkup', 'tavily', 'exa', 'kagi', 'perplexity', 'valyu'])
			.optional(),
		web_search_exa_depth: z.enum(['fast', 'auto', 'neural', 'deep']).optional(),
		web_search_context_size: z.enum(['low', 'medium', 'high']).optional(),
		web_search_kagi_source: z.enum(['web', 'news', 'search']).optional(),
		web_search_valyu_search_type: z.enum(['all', 'web']).optional(),
		images: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
				})
			)
			.optional(),
		documents: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
					fileType: z.enum(['pdf', 'markdown', 'text', 'epub']),
				})
			)
			.optional(),
		reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
		temporary: z.boolean().optional(),
		provider_id: z.string().optional(),
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

function log(message: string, startTime: number): void {
	if (!ENABLE_LOGGING) return;
	const elapsed = Date.now() - startTime;
	console.log(`[SSE-Stream] ${message} (${elapsed}ms)`);
}

// Helper to get user ID from session token
async function getUserIdFromSession(sessionToken: string): Promise<Result<string, string>> {
	try {
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

// Helper to get user ID from API key (Bearer token)
async function getUserIdFromApiKey(authHeader: string | null): Promise<Result<string, string>> {
	if (!authHeader) {
		return err('Missing Authorization header. Use: Authorization: Bearer <your_api_key>');
	}

	if (!authHeader.startsWith('Bearer ')) {
		return err('Invalid Authorization header format. Expected: Bearer <your_api_key>');
	}

	const keyValue = authHeader.slice(7);

	if (!keyValue) {
		return err('Empty API key. Provide your key after "Bearer "');
	}

	if (!keyValue.startsWith('nc_')) {
		return err(
			'Invalid API key format. Keys should start with "nc_". Generate one at /account/developer'
		);
	}

	try {
		const allApiKeys = await db.query.apiKeys.findMany();

		const apiKeyRecord = allApiKeys.find((record) => {
			try {
				const decryptedKey = isEncrypted(record.key) ? decryptApiKey(record.key) : record.key;
				return decryptedKey === keyValue;
			} catch {
				return false;
			}
		});

		if (!apiKeyRecord) {
			return err('API key not found or has been revoked. Generate a new key at /account/developer');
		}

		await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyRecord.id));

		return ok(apiKeyRecord.userId);
	} catch (e) {
		return err(`Internal error validating API key. Please try again or contact support.`);
	}
}

async function generateConversationTitle({
	conversationId,
	userId,
	startTime,
	apiKey,
	userMessage,
	assistantMessage,
	userSettingsData,
}: {
	conversationId: string;
	userId: string;
	startTime: number;
	apiKey: string;
	userMessage: string;
	assistantMessage: string;
	userSettingsData: Doc<'user_settings'> | null;
}) {
	log('Starting conversation title generation', startTime);

	const conversation = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
	});

	if (!conversation) {
		log('Title generation: Conversation not found', startTime);
		return;
	}

	if (conversation.title !== 'New Chat') {
		log('Title generation: Conversation already has custom title', startTime);
		return;
	}

	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey,
		defaultHeaders: userSettingsData?.titleProviderId
			? { 'X-Provider': userSettingsData.titleProviderId }
			: undefined,
	});

	const titlePrompt = `Summarize this conversation into a 3-5 word title that captures the core topic.

User: """${userMessage}"""
Assistant: """${assistantMessage}"""

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
		log(`Title generation: OpenAI call failed: ${titleResult.error}`, startTime);
		return;
	}

	const titleResponse = titleResult.value;
	const rawTitle = titleResponse.choices[0]?.message?.content?.trim();

	if (!rawTitle) {
		log('Title generation: No title generated', startTime);
		return;
	}

	const generatedTitle = rawTitle.replace(/^["']|["']$/g, '');

	await db
		.update(conversations)
		.set({ title: generatedTitle, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	log(`Title generation: Successfully updated title to "${generatedTitle}"`, startTime);
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	log('Starting SSE streaming request', startTime);

	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		log(`Request body parsing failed: ${bodyResult.error}`, startTime);
		return error(400, 'Failed to parse request body');
	}

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		log(`Schema validation failed: ${parsed.error}`, startTime);
		return error(400, parsed.error);
	}
	const args = parsed.data;

	// Try API key auth first (Bearer token), then session cookie, then session_token
	const authHeader = request.headers.get('Authorization');
	let userId: string;

	if (authHeader?.startsWith('Bearer nc_')) {
		const userIdResult = await getUserIdFromApiKey(authHeader);
		if (userIdResult.isErr()) {
			log(`API key auth failed: ${userIdResult.error}`, startTime);
			return error(401, userIdResult.error);
		}
		userId = userIdResult.value;
		log('API key authentication successful', startTime);
	} else if (args.session_token) {
		const userIdResult = await getUserIdFromSession(args.session_token);
		if (userIdResult.isErr()) {
			log(`Session token auth failed: ${userIdResult.error}`, startTime);
			return error(401, userIdResult.error);
		}
		userId = userIdResult.value;
		log('Session token authentication successful', startTime);
	} else {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			log('No valid authentication found', startTime);
			return error(401, 'Authentication required: provide Bearer token or session_token');
		}
		userId = session.user.id;
		log('Cookie session authentication successful', startTime);
	}

	// Fetch model, API key, rules, user settings, and user in parallel
	const [modelRecord, keyRecord, rulesRecords, userSettingsRecord, userRecord] = await Promise.all([
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
		db.query.user.findFirst({
			where: eq(user.id, userId),
		}),
	]);

	let effectiveModelRecord = modelRecord;

	// If model is not found/enabled, check if it's a valid NanoGPT model and auto-enable it
	if (!effectiveModelRecord) {
		log(`Model ${args.model_id} not enabled, checking validity...`, startTime);
		const modelsResult = await getNanoGPTModels();
		if (modelsResult.isOk()) {
			const validModel = modelsResult.value.find((m) => m.id === args.model_id);
			if (validModel) {
				log(`Model ${args.model_id} is valid, auto-enabling`, startTime);
				const now = new Date();
				await db.insert(userEnabledModels).values({
					id: generateId(),
					userId,
					provider: Provider.NanoGPT,
					modelId: args.model_id,
					pinned: false,
					createdAt: now,
					updatedAt: now,
				});

				effectiveModelRecord = {
					id: 'auto-generated',
					userId,
					provider: Provider.NanoGPT,
					modelId: args.model_id,
					pinned: false,
					createdAt: now,
					updatedAt: now,
				};
			}
		}
	}

	if (!effectiveModelRecord) {
		log('Model not found or not enabled', startTime);
		return error(400, 'Model not found or not enabled');
	}

	const finalModelRecord = effectiveModelRecord;

	// Check if this is an image or video model (not supported for streaming)
	const modelsResult = await getNanoGPTModels();
	if (modelsResult.isOk()) {
		const modelInfo = modelsResult.value.find((m) => m.id === args.model_id);
		if (modelInfo?.architecture?.output_modalities?.includes('image')) {
			log('Image models not supported for SSE streaming', startTime);
			return error(
				400,
				'Image generation models are not supported for streaming. Use /api/generate-message instead.'
			);
		}
		if (modelInfo && supportsVideo(modelInfo)) {
			log('Video models not supported for SSE streaming', startTime);
			return error(
				400,
				'Video generation models are not supported for streaming. Use /api/generate-message instead.'
			);
		}
	}

	// Determine API key
	let actualKey: string;
	let usingServerKey = false;
	if (keyRecord?.key) {
		actualKey = isEncrypted(keyRecord.key) ? decryptApiKey(keyRecord.key) : keyRecord.key;
		log('Using user API key', startTime);
	} else if (process.env.NANOGPT_API_KEY) {
		actualKey = process.env.NANOGPT_API_KEY;
		usingServerKey = true;
		log('Using global API key', startTime);
	} else {
		log('No NanoGPT API key found', startTime);
		return error(
			403,
			'No API key found. Please add your NanoGPT API key in Settings > Models to continue chatting.'
		);
	}

	// Check daily message limit when using server API key
	if (usingServerKey) {
		const limitResult = await checkAndUpdateDailyLimit(userId, usingServerKey, true);
		if (!limitResult.allowed) {
			log(`Daily limit exceeded for user ${userId}`, startTime);
			return error(429, limitResult.error || 'Daily message limit exceeded');
		}
		log(`Daily limit check passed. Remaining: ${limitResult.remaining}`, startTime);
	}

	// Validate model is subscription-eligible when using server key in subscription-only mode
	if (usingServerKey && isSubscriptionOnlyMode()) {
		const allModels = await getNanoGPTModels();
		if (allModels.isOk()) {
			const requestedModel = allModels.value.find((m) => m.id === args.model_id);
			if (!requestedModel || requestedModel.subscription?.included !== true) {
				log(
					`Model ${args.model_id} is not a subscription model - rejecting for server key user`,
					startTime
				);
				return error(
					403,
					'This model is not available with the server API key. Please use a subscription-included model or add your own API key.'
				);
			}
			log(`Model ${args.model_id} subscription validation passed`, startTime);
		}
	}

	// Disable web features if restricted for server key users
	let effectiveWebSearchMode = args.web_search_mode;
	let effectiveWebSearchEnabled = args.web_search_enabled;
	if (usingServerKey && isWebDisabledForServerKey()) {
		effectiveWebSearchMode = 'off';
		effectiveWebSearchEnabled = false;
		log('Web search disabled for server key user', startTime);
	}

	let conversationId = args.conversation_id;
	const isTemporaryChat = args.temporary === true;

	if (!conversationId) {
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
			assistantId: args.assistant_id,
			projectId: args.project_id,
			temporary: isTemporaryChat,
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
			documents: args.documents ?? null,
			webSearchEnabled:
				effectiveWebSearchMode && effectiveWebSearchMode !== 'off'
					? true
					: (effectiveWebSearchEnabled ?? false),
			createdAt: now,
		});

		log('New conversation and message created', startTime);
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
				documents: args.documents ?? null,
				webSearchEnabled:
					args.web_search_mode && args.web_search_mode !== 'off'
						? true
						: (effectiveWebSearchEnabled ?? false),
				createdAt: new Date(),
			});

			log('User message created', startTime);
		}

		// Set generating status to true and update assistant if changed
		const updateData: { generating: boolean; assistantId?: string | null } = { generating: true };

		if (args.assistant_id !== undefined && args.assistant_id !== existingConversation.assistantId) {
			updateData.assistantId = args.assistant_id || null;
			log(`Updating conversation assistant to: ${args.assistant_id || 'none'}`, startTime);
		}

		await db.update(conversations).set(updateData).where(eq(conversations.id, conversationId));
	}

	// Create and cache AbortController for this generation
	const abortController = new AbortController();
	generationAbortControllers.set(conversationId, abortController);

	// Capture values needed in the stream
	const capturedConversationId = conversationId;
	const capturedUserId = userId;
	const capturedApiKey = actualKey;
	const capturedModel = finalModelRecord;
	const capturedRules = rulesRecords;
	const capturedUserSettings = userSettingsRecord ?? null;
	const capturedUserName = userRecord?.name ?? undefined;
	const capturedReasoningEffort = args.reasoning_effort;
	const capturedWebSearchDepth =
		effectiveWebSearchMode && effectiveWebSearchMode !== 'off' ? effectiveWebSearchMode : undefined;
	const capturedWebSearchProvider = args.web_search_provider;
	const capturedWebSearchExaDepth = args.web_search_exa_depth;
	const capturedWebSearchContextSize = args.web_search_context_size;
	const capturedWebSearchKagiSource = args.web_search_kagi_source;
	const capturedWebSearchValyuSearchType = args.web_search_valyu_search_type;
	const capturedWebFeaturesDisabled = usingServerKey && isWebDisabledForServerKey();
	const capturedProviderId = args.provider_id;
	const capturedMcpEnabled = userSettingsRecord?.mcpEnabled ?? false;
	const capturedUsingServerKey = usingServerKey;

	// Return SSE stream
	const sse = new SSEEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			try {
				await streamAIResponse({
					controller,
					sse,
					conversationId: capturedConversationId,
					userId: capturedUserId,
					startTime,
					model: capturedModel,
					apiKey: capturedApiKey,
					rules: capturedRules,
					userSettingsData: capturedUserSettings,
					abortSignal: abortController.signal,
					reasoningEffort: capturedReasoningEffort,
					webSearchDepth: capturedWebSearchDepth,
					webSearchProvider: capturedWebSearchProvider,
					webSearchExaDepth: capturedWebSearchExaDepth,
					webSearchContextSize: capturedWebSearchContextSize,
					webSearchKagiSource: capturedWebSearchKagiSource,
					webSearchValyuSearchType: capturedWebSearchValyuSearchType,
					webFeaturesDisabled: capturedWebFeaturesDisabled,
					userName: capturedUserName,
					isTemporary: isTemporaryChat,
					providerId: capturedProviderId,
					mcpEnabled: capturedMcpEnabled,
					usingServerKey: capturedUsingServerKey,
				});
			} catch (e) {
				log(`Stream error: ${e}`, startTime);
				controller.enqueue(
					sse.encode({
						event: 'error',
						data: { error: e instanceof Error ? e.message : 'Unknown streaming error' },
					})
				);
			} finally {
				controller.close();
				generationAbortControllers.delete(capturedConversationId);
			}
		},
		cancel() {
			log('Client disconnected, aborting generation', startTime);
			abortController.abort();
			generationAbortControllers.delete(capturedConversationId);
		},
	});

	log('SSE stream started', startTime);
	return new Response(stream, { headers: sseHeaders() });
};

async function streamAIResponse({
	controller,
	sse,
	conversationId,
	userId,
	startTime,
	model,
	apiKey,
	rules,
	userSettingsData,
	abortSignal,
	reasoningEffort,
	webSearchDepth,
	webSearchProvider,
	webSearchExaDepth,
	webSearchContextSize,
	webSearchKagiSource,
	webSearchValyuSearchType,
	webFeaturesDisabled,
	userName,
	isTemporary,
	providerId,
	mcpEnabled,
	usingServerKey,
}: {
	controller: ReadableStreamDefaultController<Uint8Array>;
	sse: SSEEncoder;
	conversationId: string;
	userId: string;
	startTime: number;
	apiKey: string;
	model: Doc<'user_enabled_models'>;
	rules: Doc<'user_rules'>[];
	userSettingsData: Doc<'user_settings'> | null;
	abortSignal?: AbortSignal;
	reasoningEffort?: 'low' | 'medium' | 'high';
	webSearchDepth?: 'standard' | 'deep';
	webSearchProvider?: 'linkup' | 'tavily' | 'exa' | 'kagi' | 'perplexity' | 'valyu';
	webSearchExaDepth?: 'fast' | 'auto' | 'neural' | 'deep';
	webSearchContextSize?: 'low' | 'medium' | 'high';
	webSearchKagiSource?: 'web' | 'news' | 'search';
	webSearchValyuSearchType?: 'all' | 'web';
	webFeaturesDisabled?: boolean;
	userName?: string;
	isTemporary?: boolean;
	providerId?: string;
	mcpEnabled?: boolean;
	usingServerKey?: boolean;
}) {
	log('Starting SSE AI response generation', startTime);

	if (abortSignal?.aborted) {
		log('AI response generation aborted before starting', startTime);
		controller.enqueue(sse.encode({ event: 'error', data: { error: 'Cancelled by user' } }));
		return;
	}

	// Get all messages for this conversation
	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [asc(messages.createdAt)],
	});

	log(`Retrieved ${conversationMessages.length} messages from conversation`, startTime);

	const lastUserMessage = conversationMessages.filter((m) => m.role === 'user').pop();
	const modelId = model.modelId;

	// Fetch persistent memory if enabled
	let storedMemory: string | null = null;
	if (userSettingsData?.persistentMemoryEnabled) {
		log('Fetching persistent memory', startTime);
		try {
			const memory = await getUserMemory(userId);
			if (memory?.content) {
				storedMemory = memory.content;
				log(`Persistent memory loaded (${memory.content.length} chars)`, startTime);
			}
		} catch (e) {
			log(`Failed to fetch persistent memory: ${e}`, startTime);
		}
	}

	// Scrape URLs from the user message if any are present
	let scrapedContent: string = '';
	let scrapeCost = 0;

	const webScrapingEnabled = userSettingsData?.webScrapingEnabled ?? false;

	if (lastUserMessage && !webFeaturesDisabled && webScrapingEnabled) {
		log('Checking for URLs to process', startTime);

		try {
			const { regularUrls } = extractUrlsByType(lastUserMessage.content);

			if (regularUrls.length > 0) {
				log(`Processing ${regularUrls.length} regular URLs`, startTime);
				const scrapeResult = await scrapeUrls(regularUrls, apiKey);
				if (scrapeResult) {
					scrapedContent += formatScrapedContent(scrapeResult.results);
					scrapeCost = scrapeResult.summary.successful * 0.001;
				}
			}
		} catch (e) {
			log(`URL processing failed: ${e}`, startTime);
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
		webSearchEnabled: webFeaturesDisabled
			? false
			: (conversationMessages.filter((m) => m.role === 'user').pop()?.webSearchEnabled ?? false),
		createdAt: now,
	});

	log('Assistant message created', startTime);

	// Send message_start event
	controller.enqueue(
		sse.encode({
			event: 'message_start',
			data: { conversation_id: conversationId, message_id: assistantMessageId },
		})
	);

	const userMessage = conversationMessages[conversationMessages.length - 1];

	if (!userMessage) {
		const errorMsg = 'No user message found';
		await handleGenerationError({
			error: errorMsg,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		controller.enqueue(sse.encode({ event: 'error', data: { error: errorMsg } }));
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

	log(`${attachedRules.length} rules attached`, startTime);

	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey,
		defaultHeaders: providerId ? { 'X-Provider': providerId } : undefined,
	});

	const formattedMessages = await Promise.all(
		conversationMessages.map(async (m) => {
			const messageImages = m.images as Array<{
				url: string;
				storage_id: string;
				fileName?: string;
			}> | null;
			let processedImages: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
			let processedDocuments: Array<{ type: 'text'; text: string }> = [];

			// Process images if present
			if (messageImages && messageImages.length > 0 && m.role === 'user') {
				processedImages = await Promise.all(
					messageImages.map(async (img) => {
						if (img.url.startsWith('data:') || img.url.startsWith('http')) {
							return {
								type: 'image_url' as const,
								image_url: { url: img.url },
							};
						}

						const storageRecord = await db.query.storage.findFirst({
							where: eq(storage.id, img.storage_id),
						});

						if (!storageRecord) {
							console.warn(`Storage record not found for id: ${img.storage_id}`);
							return {
								type: 'image_url' as const,
								image_url: { url: img.url },
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
								image_url: { url: img.url },
							};
						}
					})
				);
			}

			// Process documents if present
			const messageDocuments = m.documents as Array<{
				url: string;
				storage_id: string;
				fileName?: string;
				fileType: 'pdf' | 'markdown' | 'text' | 'epub';
			}> | null;

			if (messageDocuments && messageDocuments.length > 0 && m.role === 'user') {
				processedDocuments = await Promise.all(
					messageDocuments.map(async (doc) => {
						if (doc.url.startsWith('data:') || doc.url.startsWith('http')) {
							return {
								type: 'text' as const,
								text: `[Document: ${doc.fileName || doc.fileType}] ${doc.url}`,
							};
						}

						const storageRecord = await db.query.storage.findFirst({
							where: eq(storage.id, doc.storage_id),
						});

						if (!storageRecord) {
							console.warn(`Storage record not found for document id: ${doc.storage_id}`);
							return {
								type: 'text' as const,
								text: `[Document: ${doc.fileName || doc.fileType}] ${doc.url}`,
							};
						}

						try {
							if (doc.fileType === 'text' || doc.fileType === 'markdown') {
								const fileBuffer = readFileSync(storageRecord.path);
								const content = fileBuffer.toString('utf-8');
								return {
									type: 'text' as const,
									text: `[${doc.fileType.toUpperCase()} Document: ${doc.fileName || 'Untitled'}]\n\n${content}`,
								};
							} else if (doc.fileType === 'epub') {
								try {
									const epubText = await extractTextFromEPUB(storageRecord.path);
									return {
										type: 'text' as const,
										text: `[EPUB Document: ${doc.fileName || 'Untitled'}]\n\n${epubText}`,
									};
								} catch (extractError) {
									console.error(`Failed to extract EPUB text:`, extractError);
									return {
										type: 'text' as const,
										text: `[EPUB Document: ${doc.fileName || 'Untitled'}] File ID: ${doc.storage_id}\n\n[Note: EPUB content could not be extracted automatically. The EPUB is stored and available for download.]`,
									};
								}
							} else {
								try {
									const pdfText = await extractTextFromPDF(storageRecord.path);
									return {
										type: 'text' as const,
										text: `[PDF Document: ${doc.fileName || 'Untitled'}]\n\n${pdfText}`,
									};
								} catch (extractError) {
									console.error(`Failed to extract PDF text:`, extractError);
									return {
										type: 'text' as const,
										text: `[PDF Document: ${doc.fileName || 'Untitled'}] File ID: ${doc.storage_id}\n\n[Note: PDF content could not be extracted automatically. The PDF is stored and available for download.]`,
									};
								}
							}
						} catch (e) {
							console.error(`Failed to read document ${doc.storage_id}:`, e);
							return {
								type: 'text' as const,
								text: `[Document: ${doc.fileName || doc.fileType}] ${doc.url}`,
							};
						}
					})
				);
			}

			if (
				(messageImages && messageImages.length > 0) ||
				(messageDocuments && messageDocuments.length > 0)
			) {
				return {
					role: 'user' as const,
					content: [
						{ type: 'text' as const, text: m.content },
						...processedImages,
						...processedDocuments,
					],
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

	if (storedMemory) {
		systemContent += `[MEMORY FROM PREVIOUS CONVERSATIONS]\n${storedMemory}\n\n[CURRENT CONVERSATION]\n`;
	}

	// Fetch assistant if assigned to conversation
	const conversation = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});

	if (conversation?.assistantId) {
		const assistant = await db.query.assistants.findFirst({
			where: eq(assistants.id, conversation.assistantId),
		});

		if (assistant?.systemPrompt) {
			const substitutedPrompt = substituteSystemPromptVariables(assistant.systemPrompt, {
				modelId: model.modelId,
				modelName: model.modelId,
				provider: model.provider,
				userName: userName,
			});
			systemContent += `${substitutedPrompt}\n\n`;
		}
	}

	// Fetch project if assigned to conversation
	if (conversation?.projectId) {
		const project = await db.query.projects.findFirst({
			where: eq(projects.id, conversation.projectId),
			with: {
				files: true,
			},
		});

		if (project) {
			if (project.systemPrompt) {
				const substitutedPrompt = substituteSystemPromptVariables(project.systemPrompt, {
					modelId: model.modelId,
					modelName: model.modelId,
					provider: model.provider,
					userName: userName,
				});
				systemContent += `\n[PROJECT INSTRUCTIONS]\n${substitutedPrompt}\n\n`;
			}

			if (project.files && project.files.length > 0) {
				let projectKnowledge = '';
				for (const file of project.files) {
					if (file.extractedContent) {
						projectKnowledge += `\n--- START OF FILE: ${file.fileName} ---\n${file.extractedContent}\n--- END OF FILE: ${file.fileName} ---\n`;
					}
				}

				if (projectKnowledge) {
					systemContent += `\n[PROJECT KNOWLEDGE BASE]\nThe following files are attached to this project. Use them as context to answer user queries.\n${projectKnowledge}\n\n`;
				}
			}
		}
	}

	if (scrapedContent) {
		systemContent += scrapedContent;
	}

	if (attachedRules.length > 0) {
		systemContent += `The user has mentioned one or more rules to follow with the @<rule_name> syntax. Please follow these rules as they apply.
Rules to follow:
${attachedRules.map((r) => `- ${r.name}: ${r.rule}`).join('\n')}`;
	}

	// Apply context memory compression if enabled
	let finalMessages = formattedMessages;
	if (
		userSettingsData?.contextMemoryEnabled &&
		formattedMessages.length > 4 &&
		!webFeaturesDisabled
	) {
		log('Applying context memory compression', startTime);
		try {
			const memoryResponse = await fetch('https://nano-gpt.com/api/v1/memory', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					messages: formattedMessages.map((m) => ({
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
					log(
						`Context memory compression applied, reduced to ${finalMessages.length} messages`,
						startTime
					);
				}
			}
		} catch (e) {
			log(`Context memory compression failed: ${e}, using original messages`, startTime);
		}
	}

	const messagesToSend =
		systemContent.length > 0
			? [
					{
						role: 'system' as const,
						content: systemContent,
					},
					...finalMessages,
				]
			: finalMessages;

	if (abortSignal?.aborted) {
		const errorMsg = 'Cancelled by user';
		await handleGenerationError({
			error: errorMsg,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		controller.enqueue(sse.encode({ event: 'error', data: { error: errorMsg } }));
		return;
	}

	const generationStart = Date.now();

	// Determine if MCP tools should be available
	const mcpAvailable = isMcpAvailable(
		mcpEnabled ?? false,
		usingServerKey ?? false,
		isSubscriptionOnlyMode()
	);

	if (mcpAvailable) {
		log('MCP tools enabled for this request', startTime);
	}

	const webSearchActive = !webFeaturesDisabled && (lastUserMessage?.webSearchEnabled ?? false);
	const tools = mcpAvailable
		? mcpToolDefinitions.filter((t) => {
				if (webSearchActive && t.type === 'function' && t.function.name === 'nanogpt_web_search') {
					return false;
				}
				return true;
			})
		: undefined;

	const streamResult = await ResultAsync.fromPromise(
		openai.chat.completions.create(
			{
				model: modelId,
				messages: messagesToSend,
				temperature: 0.7,
				stream: true,
				reasoning_effort: reasoningEffort,
				stream_options: { include_usage: true },
				tools,
				// @ts-ignore - Custom NanoGPT parameters
				linkup:
					!webFeaturesDisabled && (lastUserMessage?.webSearchEnabled ?? false)
						? {
								enabled: true,
								provider: webSearchProvider || 'linkup',
								depth:
									webSearchProvider === 'exa'
										? webSearchExaDepth || 'auto'
										: webSearchDepth === 'deep'
											? 'deep'
											: 'standard',
								...(webSearchContextSize ? { search_context_size: webSearchContextSize } : {}),
								...(webSearchProvider === 'kagi' && webSearchKagiSource
									? { kagiSource: webSearchKagiSource }
									: {}),
								...(webSearchProvider === 'valyu' && webSearchValyuSearchType
									? { searchType: webSearchValyuSearchType }
									: {}),
							}
						: undefined,
				// @ts-ignore
				youtube_transcripts: userSettingsData?.youtubeTranscriptsEnabled ?? false,
				// @ts-ignore
				prompt_caching: model.modelId.startsWith('claude-')
					? {
							enabled: true,
							ttl: '5m',
						}
					: undefined,
			} as any,
			{
				signal: abortSignal,
			}
		),
		(e) => `OpenAI API call failed: ${e}`
	);

	if (streamResult.isErr()) {
		const errorMsg = `Failed to create stream: ${streamResult.error}`;
		await handleGenerationError({
			error: errorMsg,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		controller.enqueue(sse.encode({ event: 'error', data: { error: errorMsg } }));
		return;
	}

	const openaiStream = streamResult.value as unknown as AsyncIterable<any>;
	log('OpenAI stream created successfully', startTime);

	let content = '';
	let reasoning = '';
	let chunkCount = 0;
	let generationId: string | null = null;
	const annotations: Annotation[] = [];
	let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null =
		null;
	let firstTokenTime: number | null = null;
	const toolCalls: Array<{
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	}> = [];
	let finishReason: string | null = null;

	// Track previous content for delta calculation
	let previousContent = '';
	let previousReasoning = '';

	try {
		for await (const chunk of openaiStream) {
			if (abortSignal?.aborted) {
				log('AI response generation aborted during streaming', startTime);
				break;
			}

			chunkCount++;

			reasoning += chunk.choices[0]?.delta?.reasoning || '';
			content += chunk.choices[0]?.delta?.content || '';
			annotations.push(...(chunk.choices[0]?.delta?.annotations ?? []));

			// Collect tool calls
			const deltaToolCalls = chunk.choices[0]?.delta?.tool_calls as
				| Array<{
						index: number;
						id?: string;
						type?: 'function';
						function?: { name?: string; arguments?: string };
				  }>
				| undefined;

			if (deltaToolCalls) {
				for (const dtc of deltaToolCalls) {
					const idx = dtc.index;
					// Validate index is a non-negative integer to prevent prototype pollution
					if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) {
						continue;
					}
					if (!toolCalls[idx]) {
						toolCalls[idx] = {
							id: dtc.id || '',
							type: 'function',
							function: { name: '', arguments: '' },
						};
					}
					if (dtc.id) toolCalls[idx].id = dtc.id;
					if (dtc.function?.name) toolCalls[idx].function.name += dtc.function.name;
					if (dtc.function?.arguments) toolCalls[idx].function.arguments += dtc.function.arguments;
				}
			}

			if (chunk.choices[0]?.finish_reason) {
				finishReason = chunk.choices[0].finish_reason;
			}

			if (!content && !reasoning && toolCalls.length === 0) continue;

			if (firstTokenTime === null && (content || reasoning)) {
				firstTokenTime = Date.now();
			}

			generationId = chunk.id;

			if (chunk.usage) {
				usage = chunk.usage;
			}

			// Send delta event with the new content
			const contentDelta = content.slice(previousContent.length);
			const reasoningDelta = reasoning.slice(previousReasoning.length);

			if (contentDelta || reasoningDelta) {
				controller.enqueue(
					sse.encode({
						event: 'delta',
						data: { content: contentDelta, reasoning: reasoningDelta },
					})
				);

				previousContent = content;
				previousReasoning = reasoning;
			}

			// Update message content in database periodically
			if (content || reasoning) {
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
		}

		// Handle tool calls if the model requested them
		if (finishReason === 'tool_calls' && toolCalls.length > 0 && mcpAvailable) {
			log(`Model requested ${toolCalls.length} tool call(s)`, startTime);

			// Update message to show tool execution is happening
			await db
				.update(messages)
				.set({
					content: content + '\n\n*Executing tools...*',
					generationId,
				})
				.where(eq(messages.id, assistantMessageId));

			// Execute each tool call
			const toolResults: Array<{
				role: 'tool';
				tool_call_id: string;
				content: string;
			}> = [];

			for (const tc of toolCalls) {
				if (!tc.id || !tc.function.name) continue;

				try {
					let args = JSON.parse(tc.function.arguments || '{}');

					// Special handling for vision tool
					if (tc.function.name === 'nanogpt_vision') {
						const imgUrl = args.image_url as string | undefined;
						if (!imgUrl || (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:'))) {
							log('Vision tool called without valid URL, searching context for images', startTime);

							let foundImage: string | null = null;
							for (let i = formattedMessages.length - 1; i >= 0; i--) {
								const msg = formattedMessages[i];
								if (!msg) continue;
								if (typeof msg.content !== 'string' && Array.isArray(msg.content)) {
									for (const part of msg.content) {
										if (
											part &&
											typeof part === 'object' &&
											'type' in part &&
											part.type === 'image_url' &&
											'image_url' in part
										) {
											// @ts-ignore
											foundImage = part.image_url.url;
											break;
										}
									}
								}
								if (foundImage) break;
							}

							if (foundImage) {
								log('Injected image from context into vision tool', startTime);
								args.image_url = foundImage;
							}
						}
					}

					log(`Executing tool ${tc.function.name}`, startTime);

					const result = await executeMcpTool(tc.function.name, args, apiKey);

					toolResults.push({
						role: 'tool',
						tool_call_id: tc.id,
						content: result.success ? result.result : `Error: ${result.error}`,
					});

					log(`Tool ${tc.function.name} completed`, startTime);
				} catch (e) {
					log(`Tool ${tc.function.name} failed: ${e}`, startTime);
					toolResults.push({
						role: 'tool',
						tool_call_id: tc.id,
						content: `Error executing tool: ${e instanceof Error ? e.message : 'Unknown error'}`,
					});
				}
			}

			// Make a follow-up API call with tool results
			log('Making follow-up call with tool results', startTime);

			const followUpMessages = [
				...messagesToSend,
				{
					role: 'assistant' as const,
					content: content || null,
					tool_calls: toolCalls.map((tc) => ({
						id: tc.id,
						type: 'function' as const,
						function: tc.function,
					})),
				},
				...toolResults,
			];

			const followUpResult = await ResultAsync.fromPromise(
				openai.chat.completions.create(
					{
						model: modelId,
						messages: followUpMessages as any,
						temperature: 0.7,
						stream: true,
						stream_options: { include_usage: true },
					},
					{ signal: abortSignal }
				),
				(e) => `Follow-up API call failed: ${e}`
			);

			if (followUpResult.isOk()) {
				const followUpStream = followUpResult.value as unknown as AsyncIterable<any>;

				content = '';
				reasoning = '';
				previousContent = '';
				previousReasoning = '';

				for await (const chunk of followUpStream) {
					if (abortSignal?.aborted) break;

					reasoning += chunk.choices[0]?.delta?.reasoning || '';
					content += chunk.choices[0]?.delta?.content || '';

					if (chunk.usage) usage = chunk.usage;
					if (chunk.id) generationId = chunk.id;

					const contentDelta = content.slice(previousContent.length);
					const reasoningDelta = reasoning.slice(previousReasoning.length);

					if (contentDelta || reasoningDelta) {
						controller.enqueue(
							sse.encode({
								event: 'delta',
								data: { content: contentDelta, reasoning: reasoningDelta },
							})
						);

						previousContent = content;
						previousReasoning = reasoning;
					}

					if (content || reasoning) {
						await db
							.update(messages)
							.set({
								content,
								reasoning: reasoning.length > 0 ? reasoning : null,
								generationId,
							})
							.where(eq(messages.id, assistantMessageId));
					}
				}

				log('Follow-up response completed', startTime);
			} else {
				log(`Follow-up call failed: ${followUpResult.error}`, startTime);
			}
		}

		if (!generationId) {
			log('No generation id found', startTime);
			controller.enqueue(
				sse.encode({ event: 'message_complete', data: { token_count: 0, response_time_ms: 0 } })
			);
			return;
		}

		const contentHtmlResultPromise = ResultAsync.fromPromise(
			md.renderAsync(content),
			(e) => `Failed to render HTML: ${e}`
		);

		// Calculate cost from usage and model pricing
		let costUsd: number | undefined = undefined;
		let tokenCount: number | undefined = undefined;

		if (usage) {
			tokenCount = usage.completion_tokens;

			const promptTokens = usage.prompt_tokens ?? 0;
			const completionTokens = usage.completion_tokens ?? 0;
			let promptPricePerMillion = 0;
			let completionPricePerMillion = 0;

			if (providerId) {
				try {
					const providersResponse = await fetch(
						`https://nano-gpt.com/api/models/${encodeURIComponent(model.modelId)}/providers`,
						{
							headers: {
								Authorization: `Bearer ${apiKey}`,
								'Content-Type': 'application/json',
							},
						}
					);

					if (providersResponse.ok) {
						const providersData = await providersResponse.json();
						if (providersData.providers) {
							const selectedProvider = providersData.providers.find(
								(p: any) => p.provider === providerId && p.available
							);
							if (selectedProvider?.pricing) {
								promptPricePerMillion = (selectedProvider.pricing.inputPer1kTokens || 0) * 1000;
								completionPricePerMillion =
									(selectedProvider.pricing.outputPer1kTokens || 0) * 1000;
								log(
									`Using provider-specific pricing for ${providerId}: prompt=$${promptPricePerMillion}/M, completion=$${completionPricePerMillion}/M`,
									startTime
								);
							}
						}
					}
				} catch (e) {
					log(`Failed to fetch provider-specific pricing: ${e}`, startTime);
				}
			}

			if (promptPricePerMillion === 0 && completionPricePerMillion === 0) {
				const modelsResult = await getNanoGPTModels();
				if (modelsResult.isOk()) {
					const modelInfo = modelsResult.value.find((m) => m.id === model.modelId);
					if (modelInfo?.pricing) {
						promptPricePerMillion = parseFloat(modelInfo.pricing.prompt) || 0;
						completionPricePerMillion = parseFloat(modelInfo.pricing.completion) || 0;
					}
				}
			}

			if (promptPricePerMillion > 0 || completionPricePerMillion > 0) {
				const tokenCost =
					(promptTokens * promptPricePerMillion + completionTokens * completionPricePerMillion) /
					1_000_000;
				costUsd = tokenCost + scrapeCost;

				log(
					`Calculated cost: $${costUsd.toFixed(6)} (prompt: ${promptTokens}, completion: ${completionTokens})`,
					startTime
				);
			}
		}

		const contentHtmlResult = await contentHtmlResultPromise;

		const streamEndTime = Date.now();
		const responseTimeMs =
			firstTokenTime !== null ? streamEndTime - firstTokenTime : streamEndTime - generationStart;
		const ttftMs = firstTokenTime !== null ? firstTokenTime - generationStart : null;
		log(
			`Stream processing completed. ${chunkCount} chunks, ${content.length} chars, TTFT=${ttftMs}ms, streamingTime=${responseTimeMs}ms`,
			startTime
		);

		// Update message with final data
		await db
			.update(messages)
			.set({
				tokenCount,
				costUsd,
				generationId,
				contentHtml: contentHtmlResult.unwrapOr(null),
				responseTimeMs,
			})
			.where(eq(messages.id, assistantMessageId));

		// Send message_complete event
		controller.enqueue(
			sse.encode({
				event: 'message_complete',
				data: {
					token_count: tokenCount,
					cost_usd: costUsd,
					response_time_ms: responseTimeMs,
				},
			})
		);

		// Track analytics asynchronously (don't await)
		(async () => {
			try {
				if (tokenCount !== undefined && costUsd !== undefined) {
					const existing = await db
						.select()
						.from(modelPerformanceStats)
						.where(
							and(
								eq(modelPerformanceStats.userId, userId),
								eq(modelPerformanceStats.modelId, model.modelId),
								eq(modelPerformanceStats.provider, Provider.NanoGPT)
							)
						)
						.get();

					if (existing) {
						const newTotalMessages = existing.totalMessages + 1;
						const newTotalCost = existing.totalCost + costUsd;
						const newAvgTokens = existing.avgTokens
							? (existing.avgTokens * existing.totalMessages + tokenCount) / newTotalMessages
							: tokenCount;
						const newAvgResponseTime =
							responseTimeMs !== undefined && existing.avgResponseTime
								? (existing.avgResponseTime * existing.totalMessages + responseTimeMs) /
									newTotalMessages
								: existing.avgResponseTime;

						await db
							.update(modelPerformanceStats)
							.set({
								totalMessages: newTotalMessages,
								totalCost: newTotalCost,
								avgTokens: newAvgTokens,
								avgResponseTime: responseTimeMs !== undefined ? newAvgResponseTime : undefined,
								lastUpdated: new Date(),
							})
							.where(eq(modelPerformanceStats.id, existing.id));
					} else {
						await db.insert(modelPerformanceStats).values({
							id: generateId(),
							userId,
							modelId: model.modelId,
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
				}
			} catch (e) {
				log(`Error updating stats: ${e}`, startTime);
			}
		})();

		// Generate title if needed (after response is complete)
		if (lastUserMessage && content) {
			generateConversationTitle({
				conversationId,
				userId,
				startTime,
				apiKey,
				userMessage: lastUserMessage.content,
				assistantMessage: content,
				userSettingsData,
			}).catch((e) => log(`Title generation error: ${e}`, startTime));
		}

		// Update conversation generating status and cost
		await db
			.update(conversations)
			.set({
				generating: false,
				updatedAt: new Date(),
				costUsd: sql`COALESCE(${conversations.costUsd}, 0) + ${costUsd ?? 0}`,
			})
			.where(eq(conversations.id, conversationId));

		// Update persistent memory if enabled
		if (userSettingsData?.persistentMemoryEnabled) {
			log('Updating persistent memory', startTime);
			try {
				const allMessages = [
					...(storedMemory ? [{ role: 'system' as const, content: storedMemory }] : []),
					...formattedMessages.map((m) => ({
						role: m.role as 'user' | 'assistant' | 'system',
						content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
					})),
					{ role: 'assistant' as const, content },
				];

				const memoryResponse = await fetch('https://nano-gpt.com/api/v1/memory', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
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
						log(`Persistent memory updated (${compressedMemory.length} chars)`, startTime);
					}
				}
			} catch (e) {
				log(`Failed to update persistent memory: ${e}`, startTime);
			}
		}

		log('SSE stream completed successfully', startTime);
	} catch (streamError) {
		const errorMsg = `Stream processing error: ${streamError}`;
		await handleGenerationError({
			error: errorMsg,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		controller.enqueue(
			sse.encode({
				event: 'error',
				data: { error: streamError instanceof Error ? streamError.message : 'Unknown error' },
			})
		);
	}
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
	log(`Error: ${error}`, startTime);

	if (messageId) {
		await db.update(messages).set({ error }).where(eq(messages.id, messageId));
	}

	await db
		.update(conversations)
		.set({ generating: false })
		.where(eq(conversations.id, conversationId));
}
