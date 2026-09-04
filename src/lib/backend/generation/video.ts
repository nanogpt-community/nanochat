import { db, generateId } from '$lib/db';
import {
	conversations,
	messages,
	storage,
	type UserEnabledModel,
	type UserSettings,
} from '$lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { Provider } from '$lib/types';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { generateConversationTitle, handleGenerationError } from './finalize';
import type { Log } from './schema';

async function readStorageBuffer(path: string): Promise<Buffer> {
	return Buffer.from(await readFile(path));
}

export async function generateVideoResponse({
	conversationId,
	userId,
	model,
	apiKey,
	abortSignal,
	userSettingsData,
	log,
}: {
	conversationId: string;
	userId: string;
	apiKey: string;
	model: UserEnabledModel;
	abortSignal?: AbortSignal;
	userSettingsData: UserSettings | null;
	log: Log;
}) {
	log('Starting Video response generation in background');

	if (abortSignal?.aborted) {
		log('Video response generation aborted before starting');
		return;
	}

	// Get all messages for this conversation
	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		columns: { id: true, role: true, content: true, images: true },
		orderBy: [asc(messages.createdAt)],
	});

	// Get the last user message
	const lastUserMessage = conversationMessages.filter((m) => m.role === 'user').pop();
	if (!lastUserMessage) {
		log('No user message found for video generation');
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
				where: and(eq(storage.id, img.storage_id), eq(storage.userId, userId)),
			});

			if (storageRecord) {
				try {
					const fileBuffer = await readStorageBuffer(storageRecord.path);
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
		const response = await fetch(nanoGptUrl('/api/generate-video'), {
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
		log(`Video generation started with runId: ${runId}. Initial cost: ${initialCost}`);

		// Poll for completion
		const maxAttempts = 120; // 10 minutes (5s interval)
		const delayMs = 5000;

		for (let i = 0; i < maxAttempts; i++) {
			if (abortSignal?.aborted) {
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, delayMs));

			const statusRes = await fetch(
				nanoGptUrl(`/api/generate-video/status?runId=${runId}&modelSlug=${model.modelId}`),
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
					videoUrl = nanoGptUrl(videoUrl);
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

					log(`Video generation completed. Cost: $${videoCost}`);

					// Generate conversation title
					await generateConversationTitle({
						conversationId,
						userId,
						log,
						apiKey,
						userMessage: prompt,
						assistantMessage: 'Generated a video based on the prompt.',
						userSettingsData,
					});
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
			log,
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
	}
}
