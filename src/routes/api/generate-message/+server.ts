import { db, generateId } from '$lib/db';
import { conversations, messages } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { Provider } from '$lib/types';
import { supportsVideo } from '$lib/utils/model-capabilities';
import { generationAbortControllers } from './cache.js';
import {
	generateMessageRequestSchema,
	type GenerateMessageRequestBody,
	type GenerateMessageResponse,
} from '$lib/backend/generation/schema';
import { authenticateGenerationRequest, prepareGeneration } from '$lib/backend/generation/request';
import { runChatGeneration } from '$lib/backend/generation/run';
import { handleGenerationError } from '$lib/backend/generation/finalize';
import { generateImageResponse } from '$lib/backend/generation/image';
import { generateVideoResponse } from '$lib/backend/generation/video';

export type { GenerateMessageRequestBody, GenerateMessageResponse };

// Set to true to enable debug logging
const ENABLE_LOGGING = true;

function log(message: string, startTime: number): void {
	if (!ENABLE_LOGGING) return;
	const elapsed = Date.now() - startTime;
	console.log(`[GenerateMessage] ${message} (${elapsed}ms)`);
}

/**
 * Background (non-streaming) generation: responds as soon as the user turn is
 * stored and runs the model in the background. Also used by scheduled tasks.
 */
export async function _generateMessageForUser({
	args,
	userId,
	startTime,
}: {
	args: GenerateMessageRequestBody;
	userId: string;
	startTime: number;
}): Promise<GenerateMessageResponse> {
	const logAt = (m: string) => log(m, startTime);
	const prep = await prepareGeneration({ args, userId, log: logAt });
	const { conversationId } = prep;

	if (prep.modelInfo?.architecture?.output_modalities?.includes('image')) {
		logAt('Detected image generation model');
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
		void generateImageResponse({
			args,
			userId,
			conversationId,
			assistantMessageId,
			apiKey: prep.apiKey,
			modelInfo: prep.modelInfo,
			log: logAt,
		}).catch((e) =>
			handleGenerationError({
				error: `Image generation failed: ${e}`,
				conversationId,
				messageId: assistantMessageId,
				log: logAt,
			})
		);
		return { ok: true, conversation_id: conversationId };
	}

	const abortController = new AbortController();
	generationAbortControllers.set(conversationId, abortController);
	const background = (m: string) => logAt(`Background: ${m}`);

	const task =
		prep.modelInfo && supportsVideo(prep.modelInfo)
			? generateVideoResponse({
					conversationId,
					userId,
					apiKey: prep.apiKey,
					model: prep.model,
					abortSignal: abortController.signal,
					userSettingsData: prep.userSettingsData,
					log: background,
				})
			: runChatGeneration({
					conversationId,
					userId,
					apiKey: prep.apiKey,
					model: prep.model,
					rules: prep.rules,
					userSettingsData: prep.userSettingsData,
					abortSignal: abortController.signal,
					reasoningEffort: args.reasoning_effort,
					webSearch: {
						depth: prep.webSearchDepth,
						provider: args.web_search_provider,
						exaDepth: args.web_search_exa_depth,
						contextSize: args.web_search_context_size,
						kagiSource: args.web_search_kagi_source,
						valyuSearchType: args.web_search_valyu_search_type,
					},
					webFeaturesDisabled: prep.webFeaturesDisabled,
					userName: prep.userName,
					isTemporary: prep.isTemporary,
					providerId: args.provider_id,
					mcpEnabled: prep.userSettingsData?.mcpEnabled ?? false,
					usingServerKey: prep.usingServerKey,
					followUps: false,
					log: background,
				});

	void task
		.catch(async (e) => {
			logAt(`Background generation error: ${e}`);
			try {
				await db
					.update(conversations)
					.set({ generating: false })
					.where(eq(conversations.id, conversationId));
			} catch (err) {
				logAt(`Failed to reset generating status after error: ${err}`);
			}
		})
		.finally(() => generationAbortControllers.delete(conversationId));

	logAt('Response sent, AI generation started in background');
	return { ok: true, conversation_id: conversationId };
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	const logAt = (m: string) => log(m, startTime);
	logAt('Starting message generation request');

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

	const userId = await authenticateGenerationRequest(request, logAt);
	const result = await _generateMessageForUser({ args: parsed.data, userId, startTime });
	return json(result);
};
