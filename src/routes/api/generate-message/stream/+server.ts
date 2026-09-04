import { error, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { supportsVideo } from '$lib/utils/model-capabilities';
import { generationAbortControllers } from '../cache.js';
import { SSEEncoder, sseHeaders, type SSEEvent } from '$lib/sse';
import { generateMessageRequestSchema } from '$lib/backend/generation/schema';
import {
	authenticateGenerationRequest,
	resolveGenerationContext,
	persistUserTurn,
} from '$lib/backend/generation/request';
import { runChatGeneration } from '$lib/backend/generation/run';
import {
	handleGenerationAbort,
	handleGenerationError,
	isAbortError,
} from '$lib/backend/generation/finalize';

// Set to true to enable debug logging
const ENABLE_LOGGING = true;

function log(message: string, startTime: number): void {
	if (!ENABLE_LOGGING) return;
	const elapsed = Date.now() - startTime;
	console.log(`[GenerateMessage] ${message} (${elapsed}ms)`);
}

function isClosedControllerError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return error.name === 'TypeError' && error.message.includes('Invalid state');
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	const logAt = (m: string) => log(m, startTime);
	logAt('Starting SSE streaming request');

	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);
	if (bodyResult.isErr()) {
		logAt(`Request body parsing failed: ${bodyResult.error}`);
		return error(400, 'Failed to parse request body');
	}

	const parsed = generateMessageRequestSchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		logAt(`Schema validation failed: ${parsed.error}`);
		return error(400, parsed.error);
	}
	const args = parsed.data;

	const userId = await authenticateGenerationRequest(request, logAt);
	const ctx = await resolveGenerationContext({ args, userId, log: logAt });

	// Checked before anything is persisted so a rejected request leaves no trace.
	if (ctx.modelInfo?.architecture?.output_modalities?.includes('image')) {
		return error(
			400,
			'Image generation models are not supported for streaming. Use /api/generate-message instead.'
		);
	}
	if (ctx.modelInfo && supportsVideo(ctx.modelInfo)) {
		return error(
			400,
			'Video generation models are not supported for streaming. Use /api/generate-message instead.'
		);
	}

	const conversationId = await persistUserTurn({ args, ctx, log: logAt });

	const abortController = new AbortController();
	generationAbortControllers.set(conversationId, abortController);

	const sse = new SSEEncoder();
	let assistantMessageId: string | undefined;

	const stream = new ReadableStream({
		async start(controller) {
			let streamClosed = false;
			const enqueue = (bytes: Uint8Array): boolean => {
				if (streamClosed) return false;
				try {
					controller.enqueue(bytes);
					return true;
				} catch (e) {
					if (isClosedControllerError(e)) {
						streamClosed = true;
						return false;
					}
					throw e;
				}
			};
			const sendEvent = (event: SSEEvent) => enqueue(sse.encode(event));
			const closeStream = () => {
				if (streamClosed) return;
				streamClosed = true;
				try {
					controller.close();
				} catch (e) {
					if (!isClosedControllerError(e)) throw e;
				}
			};
			const heartbeat = setInterval(() => enqueue(sse.encodeComment('keepalive')), 5000);

			try {
				await runChatGeneration({
					conversationId,
					userId,
					apiKey: ctx.apiKey,
					model: ctx.model,
					rules: ctx.rules,
					userSettingsData: ctx.userSettingsData,
					abortSignal: abortController.signal,
					reasoningEffort: args.reasoning_effort,
					webSearch: {
						depth: ctx.webSearchDepth,
						provider: args.web_search_provider,
						exaDepth: args.web_search_exa_depth,
						contextSize: args.web_search_context_size,
						kagiSource: args.web_search_kagi_source,
						valyuSearchType: args.web_search_valyu_search_type,
					},
					webFeaturesDisabled: ctx.webFeaturesDisabled,
					userName: ctx.userName,
					isTemporary: ctx.isTemporary,
					providerId: args.provider_id,
					mcpEnabled: ctx.userSettingsData?.mcpEnabled ?? false,
					usingServerKey: ctx.usingServerKey,
					followUps: true,
					sendEvent,
					onMessageId: (id) => {
						assistantMessageId = id;
					},
					log: logAt,
				});
			} catch (e) {
				// runChatGeneration handles its own failures; this is the safety net for
				// anything thrown outside it.
				if (abortController.signal.aborted || streamClosed || isAbortError(e)) {
					logAt('Stream aborted after client disconnect');
					await handleGenerationAbort({ conversationId, log: logAt });
					return;
				}
				const message = e instanceof Error ? e.message : 'Unknown streaming error';
				await handleGenerationError({
					error: message,
					conversationId,
					messageId: assistantMessageId,
					log: logAt,
				});
				sendEvent({ event: 'error', data: { error: message } });
			} finally {
				clearInterval(heartbeat);
				closeStream();
				generationAbortControllers.delete(conversationId);
			}
		},
		cancel() {
			logAt('Client disconnected, aborting generation');
			abortController.abort();
			generationAbortControllers.delete(conversationId);
		},
	});

	logAt('SSE stream started');
	return new Response(stream, { headers: sseHeaders() });
};
