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
	projectFiles,
	apiKeys,
	user,
	modelPerformanceStats,
} from '$lib/db/schema';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extractTextFromPDF } from '$lib/utils/pdf-extraction';
import { extractTextFromEPUB } from '$lib/utils/epub-extraction';
import { eq, and, asc, sql } from 'drizzle-orm';
import { join, resolve } from 'path';
import { auth } from '$lib/auth';
import { Provider, type Annotation } from '$lib/types';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { Result, ResultAsync, ok, err, okAsync } from 'neverthrow';
import OpenAI from 'openai';
import { z } from 'zod/v4';
import { generationAbortControllers } from './cache.js';
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
		web_search_provider: z.enum(['linkup', 'tavily', 'exa', 'kagi']).optional(),
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
		provider_id: z.string().optional(), // X-Provider header for provider selection
		image_params: z.record(z.string(), z.any()).optional(), // Image generation settings (resolution, quality, etc.)
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
async function getUserIdFromSession(sessionToken: string): Promise<Result<string, string>> {
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

// Helper to get user ID from API key (Bearer token)
async function getUserIdFromApiKey(authHeader: string | null): Promise<Result<string, string>> {
	if (!authHeader) {
		return err('Missing Authorization header. Use: Authorization: Bearer <your_api_key>');
	}

	if (!authHeader.startsWith('Bearer ')) {
		return err('Invalid Authorization header format. Expected: Bearer <your_api_key>');
	}

	const keyValue = authHeader.slice(7); // Remove 'Bearer ' prefix

	if (!keyValue) {
		return err('Empty API key. Provide your key after "Bearer "');
	}

	if (!keyValue.startsWith('nc_')) {
		return err(
			'Invalid API key format. Keys should start with "nc_". Generate one at /account/developer'
		);
	}

	try {
		// Get all API keys for the user and compare after decryption
		const allApiKeys = await db.query.apiKeys.findMany();

		// Find matching key by decrypting each one
		const apiKeyRecord = allApiKeys.find((record) => {
			try {
				const decryptedKey = isEncrypted(record.key) ? decryptApiKey(record.key) : record.key;
				return decryptedKey === keyValue;
			} catch {
				// If decryption fails, skip this record
				return false;
			}
		});

		if (!apiKeyRecord) {
			return err('API key not found or has been revoked. Generate a new key at /account/developer');
		}

		// Update lastUsedAt timestamp
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
		defaultHeaders: userSettingsData?.titleProviderId
			? { 'X-Provider': userSettingsData.titleProviderId }
			: undefined,
	});

	// Create a prompt for title generation using user message and assistant response
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
	webSearchDepth,
	webSearchProvider,
	webFeaturesDisabled,
	userName,
	isTemporary,
	providerId,
	mcpEnabled,
	usingServerKey,
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
	webSearchDepth?: 'standard' | 'deep';
	webSearchProvider?: 'linkup' | 'tavily' | 'exa' | 'kagi';
	webFeaturesDisabled?: boolean;
	userName?: string;
	isTemporary?: boolean;
	providerId?: string; // X-Provider header for provider selection
	mcpEnabled?: boolean;
	usingServerKey?: boolean;
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

	const lastUserMessage = conversationMessages.filter((m) => m.role === 'user').pop();
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

	// Scrape URLs from the user message if any are present
	// Skip if web features are disabled for this user OR if web scraping is disabled in settings
	let scrapedContent: string = '';
	let scrapeCost = 0;

	const webScrapingEnabled = userSettingsData?.webScrapingEnabled ?? false;

	if (lastUserMessage && !webFeaturesDisabled && webScrapingEnabled) {
		log('Background: Checking for URLs to process', startTime);

		try {
			// Separate URLs by type
			const { regularUrls } = extractUrlsByType(lastUserMessage.content);

			// Process regular URLs
			if (regularUrls.length > 0) {
				log(`Background: Processing ${regularUrls.length} regular URLs`, startTime);
				const scrapeResult = await scrapeUrls(regularUrls, apiKey);
				if (scrapeResult) {
					scrapedContent += formatScrapedContent(scrapeResult.results);
					scrapeCost = scrapeResult.summary.successful * 0.001;
				}
			}
		} catch (e) {
			log(`Background: URL processing failed: ${e}`, startTime);
		}
	} else if (webFeaturesDisabled && lastUserMessage) {
		log('Background: Skipping URL scraping - web features disabled for this user', startTime);
	} else if (!webScrapingEnabled && lastUserMessage) {
		log('Background: Skipping URL scraping - web scraping disabled in user settings', startTime);
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
						// If it's already a data URL or http url, return as is
						if (doc.url.startsWith('data:') || doc.url.startsWith('http')) {
							return {
								type: 'text' as const,
								text: `[Document: ${doc.fileName || doc.fileType}] ${doc.url}`,
							};
						}

						// Look up storage record
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
							// For text and markdown files, read content
							if (doc.fileType === 'text' || doc.fileType === 'markdown') {
								const fileBuffer = readFileSync(storageRecord.path);
								const content = fileBuffer.toString('utf-8');
								return {
									type: 'text' as const,
									text: `[${doc.fileType.toUpperCase()} Document: ${doc.fileName || 'Untitled'}]\n\n${content}`,
								};
							} else if (doc.fileType === 'epub') {
								// For EPUB files, extract text content
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
								// For PDFs, try to extract text content
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

	// Add persistent memory context first (if available)
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
			// Substitute variables in system prompt
			const substitutedPrompt = substituteSystemPromptVariables(assistant.systemPrompt, {
				modelId: model.modelId,
				modelName: model.modelId, // NanoGPT doesn't have separate model names
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
			// Add project custom instructions
			if (project.systemPrompt) {
				const substitutedPrompt = substituteSystemPromptVariables(project.systemPrompt, {
					modelId: model.modelId,
					modelName: model.modelId,
					provider: model.provider,
					userName: userName,
				});
				systemContent += `\n[PROJECT INSTRUCTIONS]\n${substitutedPrompt}\n\n`;
			}

			// Add project files context
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

	// Add scraped URL content (if any)
	if (scrapedContent) {
		systemContent += scrapedContent;
	}

	if (attachedRules.length > 0) {
		systemContent += `The user has mentioned one or more rules to follow with the @<rule_name> syntax. Please follow these rules as they apply.
Rules to follow:
${attachedRules.map((r) => `- ${r.name}: ${r.rule}`).join('\n')}`;
	}

	// Apply context memory compression if enabled (skip if features disabled for server key users)
	let finalMessages = formattedMessages;
	if (
		userSettingsData?.contextMemoryEnabled &&
		formattedMessages.length > 4 &&
		!webFeaturesDisabled
	) {
		log('Background: Applying context memory compression', startTime);
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
						`Background: Context memory compression applied, reduced to ${finalMessages.length} messages`,
						startTime
					);
				}
			} else {
				log(
					`Background: Context memory API returned ${memoryResponse.status}, using original messages`,
					startTime
				);
			}
		} catch (e) {
			log(
				`Background: Context memory compression failed: ${e}, using original messages`,
				startTime
			);
		}
	} else if (webFeaturesDisabled && userSettingsData?.contextMemoryEnabled) {
		log('Background: Skipping context memory - features disabled for this user', startTime);
	}

	// Only include system message if there is content
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
		await handleGenerationError({
			error: 'Cancelled by user',
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
		return;
	}

	// Measure end-to-end generation time (API call + streaming)
	const generationStart = Date.now();

	// Determine if MCP tools should be available
	const mcpAvailable = isMcpAvailable(
		mcpEnabled ?? false,
		usingServerKey ?? false,
		isSubscriptionOnlyMode()
	);

	if (mcpAvailable) {
		log('Background: MCP tools enabled for this request', startTime);
	}

	const streamResult = await ResultAsync.fromPromise(
		openai.chat.completions.create(
			{
				model: modelId,
				messages: messagesToSend,
				temperature: 0.7,
				stream: true,
				reasoning_effort: reasoningEffort,
				stream_options: { include_usage: true },
				// Add MCP tools when enabled
				tools: mcpAvailable ? mcpToolDefinitions : undefined,
				// @ts-ignore - Custom NanoGPT parameters
				linkup:
					!webFeaturesDisabled && (lastUserMessage?.webSearchEnabled ?? false)
						? {
							enabled: true,
							provider: webSearchProvider || 'linkup',
							depth: webSearchDepth === 'deep' ? 'deep' : 'standard',
						}
						: undefined,
				// @ts-ignore - Custom NanoGPT parameters
				youtube_transcripts: userSettingsData?.youtubeTranscriptsEnabled ?? false,
				// @ts-ignore - Custom NanoGPT parameters
				prompt_caching: model.modelId.startsWith('claude-')
					? {
						enabled: true,
						ttl: '5m',
					}
					: undefined,
			} as any, // Cast to any to allow custom parameters
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

	const stream = streamResult.value as unknown as AsyncIterable<any>;
	log('Background: OpenAI stream created successfully', startTime);

	let content = '';
	let reasoning = '';
	let chunkCount = 0;
	let generationId: string | null = null;
	const annotations: Annotation[] = [];
	let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null =
		null;
	// Track time when first content token arrives for accurate tok/sec calculation
	let firstTokenTime: number | null = null;
	// Collect tool calls during streaming (they come incrementally)
	const toolCalls: Array<{
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	}> = [];
	let finishReason: string | null = null;

	try {
		for await (const chunk of stream) {
			if (abortSignal?.aborted) {
				log('AI response generation aborted during streaming', startTime);
				break;
			}

			chunkCount++;

			reasoning += chunk.choices[0]?.delta?.reasoning || '';
			content += chunk.choices[0]?.delta?.content || '';
			annotations.push(...(chunk.choices[0]?.delta?.annotations ?? []));

			// Collect tool calls (they come incrementally in streaming)
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
					// Initialize tool call entry if needed
					if (!toolCalls[idx]) {
						toolCalls[idx] = {
							id: dtc.id || '',
							type: 'function',
							function: { name: '', arguments: '' },
						};
					}
					// Accumulate the data
					if (dtc.id) toolCalls[idx].id = dtc.id;
					if (dtc.function?.name) toolCalls[idx].function.name += dtc.function.name;
					if (dtc.function?.arguments) toolCalls[idx].function.arguments += dtc.function.arguments;
				}
			}

			// Track finish reason
			if (chunk.choices[0]?.finish_reason) {
				finishReason = chunk.choices[0].finish_reason;
			}

			if (!content && !reasoning && toolCalls.length === 0) continue;

			// Record time of first content token for accurate tok/sec
			if (firstTokenTime === null && (content || reasoning)) {
				firstTokenTime = Date.now();
			}

			generationId = chunk.id;

			// Extract usage from the final chunk (appears when include_usage is true)
			if (chunk.usage) {
				usage = chunk.usage;
			}

			// Update message content in database (only if there's content to show)
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
			log(`Background: Model requested ${toolCalls.length} tool call(s)`, startTime);

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

					// Special handling for vision tool: inject image from context if missing
					if (tc.function.name === 'nanogpt_vision') {
						const imgUrl = args.image_url as string | undefined;
						// If no URL provided, or it's not a valid URL/data-uri, try to find one in context
						if (!imgUrl || (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:'))) {
							log(
								'Background: Vision tool called without valid URL, searching context for images',
								startTime
							);

							// Search backwards for the most recent image
							let foundImage: string | null = null;
							// Iterate formattedMessages in reverse
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
											// @ts-ignore - TS might not infer the type perfectly here
											foundImage = part.image_url.url;
											break;
										}
									}
								}
								if (foundImage) break;
							}

							if (foundImage) {
								log('Background: Injected image from context into vision tool', startTime);
								args.image_url = foundImage;
							} else {
								log('Background: No image found in context for vision tool', startTime);
							}
						}
					}

					log(`Background: Executing tool ${tc.function.name}`, startTime);

					const result = await executeMcpTool(tc.function.name, args, apiKey);

					toolResults.push({
						role: 'tool',
						tool_call_id: tc.id,
						content: result.success ? result.result : `Error: ${result.error}`,
					});

					log(`Background: Tool ${tc.function.name} completed`, startTime);
				} catch (e) {
					log(`Background: Tool ${tc.function.name} failed: ${e}`, startTime);
					toolResults.push({
						role: 'tool',
						tool_call_id: tc.id,
						content: `Error executing tool: ${e instanceof Error ? e.message : 'Unknown error'}`,
					});
				}
			}

			// Make a follow-up API call with tool results
			log('Background: Making follow-up call with tool results', startTime);

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

				// Reset content for follow-up response
				content = '';
				reasoning = '';

				for await (const chunk of followUpStream) {
					if (abortSignal?.aborted) break;

					reasoning += chunk.choices[0]?.delta?.reasoning || '';
					content += chunk.choices[0]?.delta?.content || '';

					if (chunk.usage) usage = chunk.usage;
					if (chunk.id) generationId = chunk.id;

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

				log('Background: Follow-up response completed', startTime);
			} else {
				log(`Background: Follow-up call failed: ${followUpResult.error}`, startTime);
			}
		}

		if (!generationId) {
			log('Background: No generation id found', startTime);
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

			// If a specific provider is selected, use provider-specific pricing
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
									`Background: Using provider-specific pricing for ${providerId}: prompt=$${promptPricePerMillion}/M, completion=$${completionPricePerMillion}/M`,
									startTime
								);
							}
						}
					}
				} catch (e) {
					log(`Background: Failed to fetch provider-specific pricing: ${e}`, startTime);
				}
			}

			// Fall back to default model pricing if no provider pricing available
			if (promptPricePerMillion === 0 && completionPricePerMillion === 0) {
				const modelsResult = await getNanoGPTModels();
				if (modelsResult.isOk()) {
					const modelInfo = modelsResult.value.find((m) => m.id === model.modelId);
					if (modelInfo?.pricing) {
						promptPricePerMillion = parseFloat(modelInfo.pricing.prompt) || 0;
						completionPricePerMillion = parseFloat(modelInfo.pricing.completion) || 0;
						log(
							`Background: Using default model pricing: prompt=$${promptPricePerMillion}/M, completion=$${completionPricePerMillion}/M`,
							startTime
						);
					}
				}
			}

			if (promptPricePerMillion > 0 || completionPricePerMillion > 0) {
				const tokenCost =
					(promptTokens * promptPricePerMillion + completionTokens * completionPricePerMillion) /
					1_000_000;
				costUsd = tokenCost + scrapeCost;

				log(
					`Background: Calculated cost: $${costUsd.toFixed(6)} (prompt: ${promptTokens}, completion: ${completionTokens}, scrape: $${scrapeCost}, provider: ${providerId || 'default'})`,
					startTime
				);
			}
		} else {
			log('Background: No usage data available from stream', startTime);
		}

		const contentHtmlResult = await contentHtmlResultPromise;

		if (contentHtmlResult.isErr()) {
			log(`Background: Failed to render HTML: ${contentHtmlResult.error}`, startTime);
		}

		// Compute streaming time for accurate tok/sec calculation
		// responseTimeMs = time from first token to completion (streaming time only)
		// This excludes TTFT (time-to-first-token) for more accurate tok/sec
		const streamEndTime = Date.now();
		const responseTimeMs =
			firstTokenTime !== null ? streamEndTime - firstTokenTime : streamEndTime - generationStart; // fallback to total time if no tokens received
		const ttftMs = firstTokenTime !== null ? firstTokenTime - generationStart : null;
		log(
			`Background stream processing completed. Processed ${chunkCount} chunks, final content length: ${content.length}, TTFT=${ttftMs}ms, streamingTime=${responseTimeMs}ms`,
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

		// Track analytics asynchronously
		(async () => {
			try {
				// Only track if we have the necessary data
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
						// Incremental update - recalculate averages
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
						// Create new stats entry
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
					log(`[analytics] Updated stats for ${model.modelId}`, startTime);
				}
			} catch (e) {
				log(`[analytics] Error updating stats: ${e}`, startTime);
			}
		})();

		// Generate title if needed (after response is complete)
		// We do this before setting generating=false so the UI continues polling
		// until the title is generated
		if (lastUserMessage && content) {
			await generateConversationTitle({
				conversationId,
				userId,
				startTime,
				apiKey,
				userMessage: lastUserMessage.content,
				assistantMessage: content,
				userSettingsData,
			}).catch((e) => log(`Background title generation error: ${e}`, startTime));
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
			log('Background: Updating persistent memory', startTime);
			try {
				// Include the new messages in memory compression
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
						log(
							`Background: Persistent memory updated (${compressedMemory.length} chars)`,
							startTime
						);
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

async function generateVideoResponse({
	conversationId,
	userId,
	startTime,
	model,
	apiKey,
	abortSignal,
}: {
	conversationId: string;
	userId: string;
	startTime: number;
	apiKey: string;
	model: Doc<'user_enabled_models'>;
	abortSignal?: AbortSignal;
}) {
	log('Starting Video response generation in background', startTime);

	if (abortSignal?.aborted) {
		log('Video response generation aborted before starting', startTime);
		return;
	}

	// Get all messages for this conversation
	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [asc(messages.createdAt)],
	});

	// Get the last user message
	const lastUserMessage = conversationMessages.filter((m) => m.role === 'user').pop();
	if (!lastUserMessage) {
		log('No user message found for video generation', startTime);
		return;
	}

	const prompt = lastUserMessage.content;
	// Check for images in the last message
	const messageImages = lastUserMessage.images as Array<{
		url: string;
		storage_id: string;
		fileName?: string;
	}> | null;

	let imageDataUrl: string | undefined;
	let imageUrl: string | undefined;

	if (messageImages && messageImages.length > 0) {
		// Use the first image
		const img = messageImages[0];
		if (!img) return; // Typescript safety
		if (img.url.startsWith('data:')) {
			imageDataUrl = img.url;
		} else if (img.url.startsWith('http')) {
			imageUrl = img.url;
		} else {
			// Resolve storage ID
			const storageRecord = await db.query.storage.findFirst({
				where: eq(storage.id, img.storage_id),
			});

			if (storageRecord) {
				try {
					const fileBuffer = readFileSync(storageRecord.path);
					const base64 = fileBuffer.toString('base64');
					imageDataUrl = `data:${storageRecord.mimeType};base64,${base64}`;
				} catch (e) {
					console.error(`Failed to read file for image ${img.storage_id}:`, e);
				}
			}
		}
	}

	// Create assistant message (placeholder)
	const assistantMessageId = generateId();
	const now = new Date();

	await db.insert(messages).values({
		id: assistantMessageId,
		conversationId,
		modelId: model.modelId,
		provider: Provider.NanoGPT,
		content: 'Generating video... (this may take a few minutes)',
		role: 'assistant',
		createdAt: now,
	});

	try {
		// Submit video generation request
		const response = await fetch('https://nano-gpt.com/api/generate-video', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
			},
			body: JSON.stringify({
				model: model.modelId,
				prompt: prompt,
				...(imageDataUrl ? { imageDataUrl } : {}),
				...(imageUrl ? { imageUrl } : {}),
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || error.error || 'Failed to submit video generation request');
		}

		const initData = await response.json();
		const runId = initData.runId;
		const initialCost = initData.cost || 0;
		log(`Video generation started with runId: ${runId}. Initial cost: ${initialCost}`, startTime);

		// Poll for completion
		const maxAttempts = 120; // 10 minutes (5s interval)
		const delayMs = 5000;

		for (let i = 0; i < maxAttempts; i++) {
			if (abortSignal?.aborted) {
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, delayMs));

			const statusRes = await fetch(
				`https://nano-gpt.com/api/generate-video/status?runId=${runId}&modelSlug=${model.modelId}`,
				{
					headers: { 'x-api-key': apiKey },
				}
			);

			if (!statusRes.ok) continue;

			const statusData = await statusRes.json();
			const status = statusData.data?.status || statusData.status; // backend returns data.status

			if (status === 'COMPLETED' || status === 'succeeded') {
				let videoUrl =
					statusData.data?.output?.video?.url || statusData.output?.video?.url || statusData.url;

				if (videoUrl && videoUrl.startsWith('/')) {
					videoUrl = `https://nano-gpt.com${videoUrl}`;
				}
				if (videoUrl) {
					const statusCost = statusData.data?.cost || statusData.cost;
					const videoCost = statusCost !== undefined ? statusCost : initialCost;

					await db
						.update(messages)
						.set({
							content: `Here is your video:\n\n${videoUrl}`,
							contentHtml: `<video src="${videoUrl}" controls class="max-w-full rounded-lg"></video>`,
							generationId: runId,
							costUsd: videoCost,
						})
						.where(eq(messages.id, assistantMessageId));

					await db
						.update(conversations)
						.set({
							generating: false,
							updatedAt: new Date(),
							costUsd: sql`COALESCE(${conversations.costUsd}, 0) + ${videoCost}`,
						})
						.where(eq(conversations.id, conversationId));

					log(`Video generation completed. Cost: $${videoCost}`, startTime);
				}
				break;
			} else if (status === 'FAILED') {
				throw new Error(statusData.data?.error || 'Video generation failed');
			}
		}
	} catch (e: any) {
		await handleGenerationError({
			error: `Video generation failed: ${e.message}`,
			conversationId,
			messageId: assistantMessageId,
			startTime,
		});
	} finally {
		// Update conversation generating status
		await db
			.update(conversations)
			.set({
				generating: false,
				updatedAt: new Date(),
			})
			.where(eq(conversations.id, conversationId));

		generationAbortControllers.delete(conversationId);
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

	// Try API key auth first (Bearer token), then session cookie, then session_token
	const authHeader = request.headers.get('Authorization');
	let userId: string;

	if (authHeader?.startsWith('Bearer nc_')) {
		// API key authentication
		const userIdResult = await getUserIdFromApiKey(authHeader);
		if (userIdResult.isErr()) {
			log(`API key auth failed: ${userIdResult.error}`, startTime);
			return error(401, userIdResult.error);
		}
		userId = userIdResult.value;
		log('API key authentication successful', startTime);
	} else if (args.session_token) {
		// Session token authentication (for external API calls with session token)
		const userIdResult = await getUserIdFromSession(args.session_token);
		if (userIdResult.isErr()) {
			log(`Session token auth failed: ${userIdResult.error}`, startTime);
			return error(401, userIdResult.error);
		}
		userId = userIdResult.value;
		log('Session token authentication successful', startTime);
	} else {
		// Cookie-based session authentication (for web UI)
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

				// Re-fetch or mock the record
				effectiveModelRecord = {
					id: 'auto-generated', // doesn't matter for logic
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

	// Determine API key
	let actualKey: string;
	let usingServerKey = false;
	if (keyRecord?.key) {
		// Decrypt the key if it's encrypted
		actualKey = isEncrypted(keyRecord.key) ? decryptApiKey(keyRecord.key) : keyRecord.key;
		log('Using user API key', startTime);
	} else if (process.env.NANOGPT_API_KEY) {
		actualKey = process.env.NANOGPT_API_KEY;
		usingServerKey = true;
		log('Using global API key', startTime);
	} else {
		// NanoGPT requires an API key
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
		log(
			'Web search disabled for server key user due to DISABLE_WEB_ON_SERVER_KEY_WITH_SUBSCRIPTION_ONLY',
			startTime
		);
	}

	let conversationId = args.conversation_id;
	const isTemporaryChat = args.temporary === true;

	// For temporary chats, we use a temp: prefixed ID but still process normally
	// The temporary chat won't be saved - we'll create a regular conversation but mark it for deletion
	if (isTemporaryChat && !conversationId) {
		log('Temporary chat mode - chat will not be saved to history', startTime);
	}

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

		// Update assistant if a different one is selected
		if (args.assistant_id !== undefined && args.assistant_id !== existingConversation.assistantId) {
			updateData.assistantId = args.assistant_id || null;
			log(`Updating conversation assistant to: ${args.assistant_id || 'none'}`, startTime);
		}

		await db.update(conversations).set(updateData).where(eq(conversations.id, conversationId));
	}

	const modelsResult = await getNanoGPTModels();
	let isImageModel = false;

	if (modelsResult.isOk()) {
		const modelInfo = modelsResult.value.find((m) => m.id === args.model_id);
		if (modelInfo?.architecture?.output_modalities?.includes('image')) {
			isImageModel = true;
		}
	}

	if (isImageModel) {
		log('Detected image generation model', startTime);

		// Create assistant message placeholder
		const assistantMessageId = generateId();
		await db.insert(messages).values({
			id: assistantMessageId,
			conversationId,
			modelId: args.model_id,
			provider: Provider.NanoGPT,
			content: 'Generating image...',
			role: 'assistant',
			createdAt: new Date(),
		});

		// Run image generation in background
		(async () => {
			try {
				let imageDataUrl: string | undefined;

				// Check for input image (img2img)
				if (args.images && args.images.length > 0) {
					const inputImage = args.images[0]!;
					const storageRecord = await db.query.storage.findFirst({
						where: eq(storage.id, inputImage.storage_id),
					});

					if (storageRecord && existsSync(storageRecord.path)) {
						const fileBuffer = readFileSync(storageRecord.path);
						const base64 = fileBuffer.toString('base64');
						imageDataUrl = `data:${storageRecord.mimeType};base64,${base64}`;
						log('Prepared input image for img2img', startTime);
					}
				}

				const payload: any = {
					model: args.model_id,
					prompt: args.message || 'Image',
					response_format: 'b64_json',
					n: args.image_params?.nImages || 1,
					size: args.image_params?.resolution || '1024x1024',
				};

				// Include additional params from image settings
				if (args.image_params?.quality) {
					payload.quality = args.image_params.quality;
				}
				if (args.image_params?.aspect_ratio) {
					payload.aspect_ratio = args.image_params.aspect_ratio;
				}
				if (args.image_params?.seed !== undefined && args.image_params?.seed !== -1) {
					payload.seed = args.image_params.seed;
				}

				if (imageDataUrl) {
					payload.imageDataUrl = imageDataUrl;
				}

				const res = await fetch('https://nano-gpt.com/v1/images/generations', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${actualKey}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
				});

				if (!res.ok) {
					const errText = await res.text();
					throw new Error(`NanoGPT API error: ${res.status} ${errText}`);
				}

				const response = await res.json();

				// Extract cost from image generation response
				const imageCost = response.cost ?? 0;
				log(`Image generation cost: $${imageCost}`, startTime);

				const image = response.data?.[0];
				if (!image?.b64_json && !image?.url) {
					throw new Error('No image data returned details: ' + JSON.stringify(image));
				}

				let buffer: Buffer;
				let mimeType = 'image/png';

				if (image.b64_json) {
					buffer = Buffer.from(image.b64_json, 'base64');
				} else if (image.url) {
					// Fallback download
					const imgRes = await fetch(image.url);
					const arrayBuffer = await imgRes.arrayBuffer();
					buffer = Buffer.from(arrayBuffer);
					const contentType = imgRes.headers.get('content-type');
					if (contentType) mimeType = contentType;
				} else {
					throw new Error('No image data');
				}

				// Ensure upload dir exists
				const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
				if (!existsSync(UPLOAD_DIR)) {
					mkdirSync(UPLOAD_DIR, { recursive: true });
				}

				const storageId = generateId();
				const extension = (mimeType.split('/')[1] || 'png').replace(/[^a-zA-Z0-9]/g, '') || 'png';
				const filename = `${storageId}.${extension}`;
				const filepath = join(UPLOAD_DIR, filename);

				// Prevent path traversal
				if (!resolve(filepath).startsWith(resolve(UPLOAD_DIR))) {
					throw new Error('Invalid file path');
				}

				writeFileSync(filepath, buffer);

				await db.insert(storage).values({
					id: storageId,
					userId,
					filename,
					mimeType,
					size: buffer.byteLength,
					path: filepath,
					createdAt: new Date(),
				});

				const imageUrl = `/api/storage/${storageId}`;
				const markdownContent = `![Generated Image](${imageUrl})`;

				await db
					.update(messages)
					.set({
						content: markdownContent,
						contentHtml: null,
						tokenCount: 0,
						costUsd: imageCost,
					})
					.where(eq(messages.id, assistantMessageId));

				await db
					.update(conversations)
					.set({
						generating: false,
						updatedAt: new Date(),
						costUsd: sql`COALESCE(${conversations.costUsd}, 0) + ${imageCost}`,
					})
					.where(eq(conversations.id, conversationId));

				// Update conversation title for image generation
				const conversation = await db.query.conversations.findFirst({
					where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
				});

				if (conversation?.title === 'New Chat' && args.message) {
					// Create a descriptive title from the image prompt
					const imageTitle =
						args.message.length > 50 ? args.message.substring(0, 47) + '...' : args.message;
					const capitalizedTitle = imageTitle.charAt(0).toUpperCase() + imageTitle.slice(1);

					await db
						.update(conversations)
						.set({ title: capitalizedTitle, updatedAt: new Date() })
						.where(eq(conversations.id, conversationId));

					log(`Image generation: Updated title to "${capitalizedTitle}"`, startTime);
				}

				log('Image generation completed', startTime);
			} catch (error) {
				log(`Image generation failed: ${error}`, startTime);
				await handleGenerationError({
					error: `Image generation failed: ${error}`,
					conversationId,
					messageId: assistantMessageId,
					startTime,
				});
			}
		})();

		return response({
			ok: true,
			conversation_id: conversationId,
		});
	}

	// Create and cache AbortController for this generation
	const abortController = new AbortController();
	generationAbortControllers.set(conversationId, abortController);

	// Check capabilities
	const allNanoModelsResult = await getNanoGPTModels();
	let supportsVideoGeneration = false;
	if (allNanoModelsResult.isOk()) {
		const modelInfo = allNanoModelsResult.value.find((m) => m.id === finalModelRecord.modelId);
		if (modelInfo) {
			supportsVideoGeneration = supportsVideo(modelInfo);
		}
	}

	// Start AI response generation in background - don't await
	if (supportsVideoGeneration) {
		generateVideoResponse({
			conversationId,
			userId,
			startTime,
			apiKey: actualKey,
			model: finalModelRecord,
			abortSignal: abortController.signal,
		})
			.catch(async (error) => {
				log(`Background Video response generation error: ${error}`, startTime);
				// Reset generating status on error
				try {
					await db
						.update(conversations)
						.set({ generating: false })
						.where(eq(conversations.id, conversationId));
				} catch (e) {
					log(`Failed to reset generating status after error: ${e}`, startTime);
				}
			})
			.finally(() => {
				// Clean up the cached AbortController
				generationAbortControllers.delete(conversationId);
			});
	} else {
		generateAIResponse({
			conversationId,
			userId,
			startTime,
			model: finalModelRecord,
			apiKey: actualKey,
			rules: rulesRecords,
			userSettingsData: userSettingsRecord ?? null,
			abortSignal: abortController.signal,
			reasoningEffort: args.reasoning_effort,
			webSearchDepth:
				effectiveWebSearchMode && effectiveWebSearchMode !== 'off'
					? effectiveWebSearchMode
					: undefined,
			webSearchProvider: args.web_search_provider,
			webFeaturesDisabled: usingServerKey && isWebDisabledForServerKey(),
			userName: userRecord?.name ?? undefined,
			isTemporary: isTemporaryChat,
			providerId: args.provider_id,
			mcpEnabled: userSettingsRecord?.mcpEnabled ?? false,
			usingServerKey,
		})
			.catch(async (error) => {
				log(`Background AI response generation error: ${error}`, startTime);
				// Reset generating status on error
				try {
					await db
						.update(conversations)
						.set({ generating: false })
						.where(eq(conversations.id, conversationId));
				} catch (e) {
					log(`Failed to reset generating status after error: ${e}`, startTime);
				}
			})
			.finally(() => {
				// Clean up the cached AbortController
				generationAbortControllers.delete(conversationId);
			});
	}

	log('Response sent, AI generation started in background', startTime);
	return response({ ok: true, conversation_id: conversationId });
};

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
		await db.update(messages).set({ error }).where(eq(messages.id, messageId));
	}

	// Update conversation generating status
	await db
		.update(conversations)
		.set({ generating: false })
		.where(eq(conversations.id, conversationId));

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
