import OpenAI from 'openai';
import { db } from '$lib/db';
import { messages, conversations, type UserRule, type UserSettings } from '$lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import { md } from '$lib/utils/markdown-it.js';
import type { Annotation } from '$lib/types';
import type { ReasoningEffort } from '$lib/utils/model-capabilities';
import type { SSEEvent } from '$lib/sse';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { modelRejectsTools, noteToolsRejection } from '$lib/backend/mcp-tools';
import { updateMemoriesFromExchange } from '$lib/backend/memory';
import { computeTokenCost } from '$lib/backend/pricing';
import { sharedKeyModelAllowed } from '$lib/backend/shared-key-policy';
import { DEFAULT_BACKGROUND_MODEL } from '$lib/backend/default-models';
import { loadConversationMessages, createAssistantMessage, buildPrompt } from './prompt';
import { resolveTools, mergeToolCallDeltas, executeToolCalls, type ToolCall } from './tools';
import { addUsage, normalizeUsageTokens, type Usage } from './usage';
import {
	isAbortError,
	handleGenerationAbort,
	handleGenerationError,
	generateConversationTitle,
	generateFollowUpSuggestions,
	recordModelStats,
} from './finalize';
import type { WEB_SEARCH_PROVIDERS, Log } from './schema';

/** A confused model can't loop forever. */
const MAX_TOOL_ROUNDS = 5;
/**
 * In-flight progress writes are throttled: per-chunk writes were an awaited
 * round trip per token. The write exists only so a disconnected client can
 * recover partial output; the authoritative write happens once the stream ends.
 */
const PROGRESS_PERSIST_INTERVAL_MS = 750;

export type WebSearchOptions = {
	depth?: 'standard' | 'deep';
	provider?: (typeof WEB_SEARCH_PROVIDERS)[number];
	exaDepth?: 'fast' | 'auto' | 'neural' | 'deep';
	contextSize?: 'low' | 'medium' | 'high';
	kagiSource?: 'web' | 'news' | 'search';
	valyuSearchType?: 'all' | 'web';
};

export type ChatGenerationParams = {
	conversationId: string;
	userId: string;
	apiKey: string;
	model: { modelId: string; provider: string };
	rules: UserRule[];
	userSettingsData: UserSettings | null;
	abortSignal?: AbortSignal;
	reasoningEffort?: ReasoningEffort;
	webSearch: WebSearchOptions;
	webFeaturesDisabled: boolean;
	userName?: string;
	isTemporary: boolean;
	providerId?: string;
	mcpEnabled: boolean;
	usingServerKey: boolean;
	/** Generate follow-up questions after the reply (skipped for background/API runs). */
	followUps: boolean;
	/** Present when streaming to a client; omitted for background generation. */
	sendEvent?: (event: SSEEvent) => boolean;
	onMessageId?: (messageId: string) => void;
	log: Log;
};

/**
 * One chat turn, end to end: prompt assembly, the model call with tool rounds,
 * persistence, cost, title/follow-ups and memory. Both the SSE endpoint and the
 * background endpoint run exactly this; only `sendEvent` differs.
 */
export async function runChatGeneration(p: ChatGenerationParams): Promise<void> {
	const { conversationId, userId, apiKey, log } = p;
	const sendEvent = p.sendEvent ?? (() => true);
	const modelId = p.model.modelId;

	if (p.abortSignal?.aborted) {
		await handleGenerationAbort({ conversationId, log });
		return;
	}

	const { conversationMessages, lastUserMessage } = await loadConversationMessages(conversationId);
	log(`Retrieved ${conversationMessages.length} messages from conversation`);
	const webSearchActive = !p.webFeaturesDisabled && (lastUserMessage?.webSearchEnabled ?? false);

	const assistantMessageId = await createAssistantMessage({
		conversationId,
		modelId,
		webSearchEnabled: webSearchActive,
	});
	p.onMessageId?.(assistantMessageId);
	sendEvent({
		event: 'message_start',
		data: { conversation_id: conversationId, message_id: assistantMessageId },
	});

	const fail = async (error: string) => {
		await handleGenerationError({ error, conversationId, messageId: assistantMessageId, log });
		sendEvent({ event: 'error', data: { error } });
	};

	if (!lastUserMessage) {
		await fail('No user message found');
		return;
	}

	const openai = new OpenAI({
		baseURL: nanoGptUrl('/api/v1'),
		apiKey,
		defaultHeaders: p.providerId ? { 'X-Provider': p.providerId } : undefined,
	});

	const { formattedMessages, messagesToSend, scrapeCost } = await buildPrompt({
		conversationId,
		userId,
		conversationMessages,
		lastUserMessage,
		model: p.model,
		apiKey,
		providerId: p.providerId,
		rules: p.rules,
		userSettingsData: p.userSettingsData,
		webFeaturesDisabled: p.webFeaturesDisabled,
		userName: p.userName,
		openai,
		log,
	});

	if (p.abortSignal?.aborted) {
		await handleGenerationAbort({ conversationId, log });
		return;
	}

	const generationStart = Date.now();
	const { tools, remoteMcp } = await resolveTools({
		mcpEnabled: p.mcpEnabled,
		usingServerKey: p.usingServerKey,
		webSearchActive,
		userId,
		log,
	});
	// Not every model accepts a tools payload, and the catalog can't be trusted to
	// say which — see modelRejectsTools. Start optimistic, fall back below.
	let sendTools = Boolean(tools) && !modelRejectsTools(modelId);

	const ws = p.webSearch;
	const requestParams = {
		model: modelId,
		messages: messagesToSend,
		temperature: 0.7,
		stream: true,
		reasoning_effort: p.reasoningEffort,
		stream_options: { include_usage: true },
		// Custom NanoGPT parameters below
		linkup: webSearchActive
			? {
					enabled: true,
					provider: ws.provider || 'linkup',
					depth:
						ws.provider === 'exa'
							? ws.exaDepth || 'auto'
							: ws.depth === 'deep'
								? 'deep'
								: 'standard',
					...(ws.contextSize ? { search_context_size: ws.contextSize } : {}),
					...(ws.provider === 'kagi' && ws.kagiSource ? { kagiSource: ws.kagiSource } : {}),
					...(ws.provider === 'valyu' && ws.valyuSearchType
						? { searchType: ws.valyuSearchType }
						: {}),
				}
			: undefined,
		youtube_transcripts: p.userSettingsData?.youtubeTranscriptsEnabled ?? false,
		prompt_caching: modelId.startsWith('claude-') ? { enabled: true, ttl: '5m' } : undefined,
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const createStream = (withTools: boolean) =>
		openai.chat.completions.create(
			{ ...requestParams, tools: withTools ? tools : undefined } as any,
			{ signal: p.abortSignal }
		);

	let streamResult = await ResultAsync.fromPromise(
		createStream(sendTools),
		(e) => `OpenAI API call failed: ${e}`
	);

	// A model that won't take tools shouldn't cost the user their whole message —
	// drop the tools and answer without them rather than failing the request.
	if (
		streamResult.isErr() &&
		sendTools &&
		!p.abortSignal?.aborted &&
		!isAbortError(streamResult.error)
	) {
		noteToolsRejection(modelId, streamResult.error);
		log(`${modelId} rejected a tools request (${streamResult.error}); retrying without tools`);
		sendTools = false;
		streamResult = await ResultAsync.fromPromise(
			createStream(false),
			(e) => `OpenAI API call failed: ${e}`
		);
	}

	if (streamResult.isErr()) {
		if (p.abortSignal?.aborted || isAbortError(streamResult.error)) {
			await handleGenerationAbort({ conversationId, log });
			return;
		}
		await fail(`Failed to create stream: ${streamResult.error}`);
		return;
	}
	log('OpenAI stream created successfully');

	let content = '';
	let reasoning = '';
	let chunkCount = 0;
	let generationId: string | null = null;
	const annotations: Annotation[] = [];
	let usage: Usage = null;
	let carriedUsage: Usage = null;
	let firstTokenTime: number | null = null;
	let previousContent = '';
	let previousReasoning = '';
	let lastPersistAt = 0;

	const persistProgress = async (force = false) => {
		if (!content && !reasoning) return;
		const now = Date.now();
		if (!force && now - lastPersistAt < PROGRESS_PERSIST_INTERVAL_MS) return;
		lastPersistAt = now;
		await db
			.update(messages)
			.set({
				content,
				reasoning: reasoning || null,
				generationId,
				annotations: annotations.length > 0 ? annotations : null,
				reasoningEffort: p.reasoningEffort,
			})
			.where(eq(messages.id, assistantMessageId));
	};

	const emitDeltas = () => {
		const contentDelta = content.slice(previousContent.length);
		const reasoningDelta = reasoning.slice(previousReasoning.length);
		if (contentDelta || reasoningDelta) {
			sendEvent({ event: 'delta', data: { content: contentDelta, reasoning: reasoningDelta } });
			previousContent = content;
			previousReasoning = reasoning;
		}
	};

	/** Drains one response stream into the accumulators; returns its finish reason. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const consume = async (stream: AsyncIterable<any>, toolCalls: ToolCall[]) => {
		let finishReason: string | null = null;
		for await (const chunk of stream) {
			if (p.abortSignal?.aborted) {
				log('Generation aborted during streaming');
				break;
			}
			chunkCount++;
			const choice = chunk.choices?.[0];
			reasoning += choice?.delta?.reasoning || '';
			content += choice?.delta?.content || '';
			annotations.push(...(choice?.delta?.annotations ?? []));
			mergeToolCallDeltas(toolCalls, choice?.delta?.tool_calls);
			if (choice?.finish_reason) finishReason = choice.finish_reason;
			if (chunk.usage) usage = chunk.usage;

			if (!content && !reasoning && toolCalls.length === 0) continue;
			if (firstTokenTime === null && (content || reasoning)) firstTokenTime = Date.now();
			if (chunk.id) generationId = chunk.id;
			emitDeltas();
			await persistProgress();
		}
		return finishReason;
	};

	try {
		const toolCalls: ToolCall[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let finishReason = await consume(
			streamResult.value as unknown as AsyncIterable<any>,
			toolCalls
		);

		// Each round executes the requested tools and feeds the results back, with
		// tools still attached so the model can chain another round if it needs to.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const toolConversation: any[] = [...messagesToSend];
		let pending = finishReason === 'tool_calls' ? toolCalls.filter(Boolean) : [];
		let roundStart = 0;

		for (let round = 0; sendTools && pending.length > 0; round++) {
			if (p.abortSignal?.aborted) break;
			if (round >= MAX_TOOL_ROUNDS) {
				log(`Tool round limit (${MAX_TOOL_ROUNDS}) reached, stopping`);
				break;
			}
			log(`Model requested ${pending.length} tool call(s) [round ${round + 1}]`);

			await db
				.update(messages)
				.set({ content: content + '\n\n*Executing tools...*', generationId })
				.where(eq(messages.id, assistantMessageId));

			const results = await executeToolCalls({
				toolCalls: pending,
				remoteMcp,
				formattedMessages,
				apiKey,
				mcpOptions: {
					visionModel: p.userSettingsData?.utilityModelId,
					visionProvider: p.userSettingsData?.utilityProviderId,
				},
				log,
			});

			toolConversation.push(
				{
					role: 'assistant',
					content: content.slice(roundStart) || null,
					tool_calls: pending.map((tc) => ({ id: tc.id, type: 'function', function: tc.function })),
				},
				...results
			);

			const followUp = await ResultAsync.fromPromise(
				openai.chat.completions.create(
					{
						model: modelId,
						messages: toolConversation,
						temperature: 0.7,
						stream: true,
						stream_options: { include_usage: true },
						tools,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any,
					{ signal: p.abortSignal }
				),
				(e) => `Follow-up API call failed: ${e}`
			);
			if (followUp.isErr()) {
				log(followUp.error);
				break;
			}

			// Every round is billed separately, so bank the finished round's usage
			// instead of letting the next one overwrite it.
			carriedUsage = addUsage(carriedUsage, usage);
			usage = null;
			roundStart = content.length;

			const next: ToolCall[] = [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			finishReason = await consume(followUp.value as unknown as AsyncIterable<any>, next);
			pending = finishReason === 'tool_calls' ? next.filter(Boolean) : [];
		}
		usage = addUsage(carriedUsage, usage);

		if (p.abortSignal?.aborted) {
			// Flush whatever arrived since the last throttled persist, otherwise stopping
			// discards up to PROGRESS_PERSIST_INTERVAL_MS of text the user already saw.
			await persistProgress(true);
			await handleGenerationAbort({ conversationId, log });
			return;
		}
		if (!generationId) {
			await fail('No response received from the model');
			return;
		}

		const streamEndTime = Date.now();
		const htmlPromise = ResultAsync.fromPromise(
			md.renderAsync(content),
			(e) => `Failed to render HTML: ${e}`
		);

		let costUsd: number | undefined;
		let tokenCount: number | undefined;
		let promptTokens: number | undefined;
		if (usage) {
			const n = normalizeUsageTokens(usage as Record<string, unknown>);
			tokenCount = n.completionTokens;
			promptTokens = n.promptTokens;
			const tokenCost = await computeTokenCost({
				modelId,
				providerId: p.providerId,
				apiKey,
				promptTokens: n.promptTokens ?? 0,
				completionTokens: n.completionTokens ?? 0,
			});
			if (tokenCost !== undefined) {
				costUsd = tokenCost + scrapeCost;
				log(
					`Calculated cost: $${costUsd.toFixed(6)} (prompt: ${n.promptTokens ?? 0}, completion: ${n.completionTokens ?? 0}, scrape: $${scrapeCost})`
				);
			}
		} else {
			log('No usage data available from stream');
		}

		const html = await htmlPromise;
		if (html.isErr()) log(html.error);

		// responseTimeMs is streaming time only (first token to end) so tok/sec
		// excludes time-to-first-token.
		const responseTimeMs =
			firstTokenTime !== null ? streamEndTime - firstTokenTime : streamEndTime - generationStart;
		const timeToFirstTokenMs =
			firstTokenTime !== null ? firstTokenTime - generationStart : undefined;
		log(
			`Stream processing completed. ${chunkCount} chunks, ${content.length} chars, TTFT=${timeToFirstTokenMs}ms, streamingTime=${responseTimeMs}ms`
		);

		await db
			.update(messages)
			.set({
				content,
				reasoning: reasoning || null,
				annotations: annotations.length > 0 ? annotations : null,
				reasoningEffort: p.reasoningEffort,
				tokenCount,
				promptTokens,
				costUsd,
				generationId,
				contentHtml: html.unwrapOr(null),
				responseTimeMs,
				timeToFirstTokenMs,
			})
			.where(eq(messages.id, assistantMessageId));

		sendEvent({
			event: 'message_complete',
			data: {
				token_count: tokenCount,
				prompt_tokens: promptTokens,
				cost_usd: costUsd,
				response_time_ms: responseTimeMs,
				time_to_first_token_ms: timeToFirstTokenMs,
			},
		});

		void recordModelStats({ userId, modelId, tokenCount, costUsd, responseTimeMs, log });

		const markDone = () =>
			db
				.update(conversations)
				.set({
					generating: false,
					updatedAt: new Date(),
					costUsd: sql`COALESCE(${conversations.costUsd}, 0) + ${costUsd ?? 0}`,
				})
				.where(eq(conversations.id, conversationId));

		// Streaming clients already have the reply, so release the generating flag
		// now. Polling clients keep polling until the title lands, so for them it
		// flips after.
		if (p.sendEvent) await markDone();

		// Background calls ride on this turn's quota, but in subscription-only mode the
		// shared key still may not touch a non-subscription model.
		const canUse = async (modelId: string | null | undefined) =>
			!p.usingServerKey || (await sharedKeyModelAllowed(modelId || DEFAULT_BACKGROUND_MODEL));
		const [titleOk, followUpOk, memoryOk] = await Promise.all([
			canUse(p.userSettingsData?.titleModelId),
			canUse(p.userSettingsData?.followUpModelId),
			canUse(p.userSettingsData?.memoryModelId),
		]);

		if (content) {
			const [title, followUps] = await Promise.all([
				titleOk
					? generateConversationTitle({
							conversationId,
							userId,
							apiKey,
							userMessage: lastUserMessage.content,
							assistantMessage: content,
							userSettingsData: p.userSettingsData,
							log,
						}).catch((e) => {
							log(`Title generation error: ${e}`);
							return null;
						})
					: Promise.resolve(null),
				p.followUps && followUpOk
					? generateFollowUpSuggestions({
							conversationId,
							assistantMessageId,
							apiKey,
							userMessage: lastUserMessage.content,
							assistantMessage: content,
							userSettingsData: p.userSettingsData,
							log,
						}).catch((e) => {
							log(`Follow-up generation error: ${e}`);
							return null;
						})
					: Promise.resolve(null),
			]);
			if (title) {
				sendEvent({ event: 'title_updated', data: { conversation_id: conversationId, title } });
			}
			if (followUps && followUps.length > 0) {
				sendEvent({
					event: 'follow_ups_updated',
					data: {
						conversation_id: conversationId,
						message_id: assistantMessageId,
						suggestions: followUps,
					},
				});
			}
		}

		if (!p.sendEvent) await markDone();

		// Extract durable facts from this exchange into cross-chat memory (fire-and-forget)
		if (p.userSettingsData?.persistentMemoryEnabled && !p.isTemporary && content && memoryOk) {
			void updateMemoriesFromExchange({
				userId,
				apiKey,
				modelId: p.userSettingsData.memoryModelId,
				providerId: p.userSettingsData.memoryProviderId,
				userMessage: lastUserMessage.content,
				assistantMessage: content,
				log,
			}).catch((e) => log(`Failed to update persistent memory: ${e}`));
		}

		log('Generation completed');
	} catch (e) {
		if (p.abortSignal?.aborted || isAbortError(e)) {
			await persistProgress(true);
			await handleGenerationAbort({ conversationId, log });
			return;
		}
		await fail(`Stream processing error: ${e}`);
	}
}
