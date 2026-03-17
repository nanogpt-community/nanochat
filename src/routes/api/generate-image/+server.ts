/**
 * Standalone image generation endpoint for the Image Studio.
 * POST: kicks off generation in the background, returns a generation_id immediately.
 * GET:  polls for the result by generation_id.
 */
import { db, generateId } from '$lib/db';
import { userKeys, userEnabledModels, storage } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod/v4';
import { Provider } from '$lib/types';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import {
	checkAndUpdateDailyLimit,
	isWebDisabledForServerKey,
	isSubscriptionOnlyMode,
} from '$lib/backend/message-limits';

// --- In-memory generation tracking ---
type GenerationStatus =
	| { status: 'pending' }
	| { status: 'complete'; images: GeneratedImage[]; cost: number }
	| { status: 'error'; message: string };

type GeneratedImage = { url: string; storage_id: string; fileName: string };

const activeGenerations = new Map<string, GenerationStatus>();

// Clean up completed generations after 10 minutes
function scheduleCleanup(id: string) {
	setTimeout(() => activeGenerations.delete(id), 10 * 60 * 1000);
}

// --- POST: start generation ---
const requestSchema = z.object({
	model_id: z.string(),
	prompt: z.string().min(1, 'Prompt is required'),
	image_params: z.record(z.string(), z.any()).optional(),
	reference_image_id: z.string().optional(),
});

export type StudioGenerateRequest = z.infer<typeof requestSchema>;

export async function POST({ request }: RequestEvent) {
	const userId = await getAuthenticatedUserId(request);

	const body = await request.json();
	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return error(400, parsed.error.issues.map((i) => i.message).join(', '));
	}

	const args = parsed.data;

	// Find API key
	const keyRecord = await db.query.userKeys.findFirst({
		where: and(eq(userKeys.userId, userId), eq(userKeys.provider, Provider.NanoGPT)),
	});

	let actualKey: string;
	let usingServerKey = false;
	if (keyRecord?.key) {
		actualKey = isEncrypted(keyRecord.key) ? decryptApiKey(keyRecord.key) : keyRecord.key;
	} else if (process.env.NANOGPT_API_KEY) {
		actualKey = process.env.NANOGPT_API_KEY;
		usingServerKey = true;
	} else {
		return error(
			403,
			'No API key found. Please add your NanoGPT API key in Settings > Models to continue.'
		);
	}

	// Check daily limits for server key users
	if (usingServerKey) {
		if (isWebDisabledForServerKey()) {
			return error(403, 'Image generation is not available with the server key.');
		}
		if (isSubscriptionOnlyMode()) {
			return error(
				403,
				'Please add your own NanoGPT API key in Settings > Models to generate images.'
			);
		}

		const limitResult = await checkAndUpdateDailyLimit(userId, true, true);
		if (!limitResult.allowed) {
			return error(429, limitResult.error ?? 'Daily image generation limit reached');
		}
	}

	// Validate model exists
	const modelsResult = await getNanoGPTModels();
	if (modelsResult.isErr()) {
		return error(500, 'Failed to fetch available models');
	}

	const modelInfo = modelsResult.value.find((m) => m.id === args.model_id);
	if (!modelInfo) {
		return error(400, `Model "${args.model_id}" not found`);
	}

	// Auto-enable model if needed
	const modelRecord = await db.query.userEnabledModels.findFirst({
		where: and(
			eq(userEnabledModels.userId, userId),
			eq(userEnabledModels.provider, Provider.NanoGPT),
			eq(userEnabledModels.modelId, args.model_id)
		),
	});

	if (!modelRecord) {
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
	}

	// Build request payload
	const imageParams = args.image_params ?? {};
	const rawImageCount = imageParams.nImages;
	const parsedImageCount =
		typeof rawImageCount === 'number' ? rawImageCount : Number(rawImageCount);
	const normalizedImageCount = Number.isFinite(parsedImageCount)
		? Math.max(1, Math.floor(parsedImageCount))
		: 1;
	const maxImages =
		typeof modelInfo.maxImages === 'number' && Number.isFinite(modelInfo.maxImages)
			? modelInfo.maxImages
			: undefined;
	const imageCount = maxImages ? Math.min(normalizedImageCount, maxImages) : normalizedImageCount;

	const payload: Record<string, unknown> = {
		model: args.model_id,
		prompt: args.prompt,
		response_format: 'b64_json',
		size: imageParams.resolution || '1024x1024',
		n: imageCount,
	};

	if (imageParams.quality) payload.quality = imageParams.quality;
	if (imageParams.aspect_ratio) payload.aspect_ratio = imageParams.aspect_ratio;
	if (imageParams.seed !== undefined) {
		const rawSeed = imageParams.seed;
		const parsedSeed = typeof rawSeed === 'number' ? rawSeed : Number(rawSeed);
		if (Number.isFinite(parsedSeed) && parsedSeed !== -1) {
			payload.seed = parsedSeed;
		}
	}

	// Pass through any additional model-specific params
	for (const [key, value] of Object.entries(imageParams)) {
		if (!['resolution', 'nImages', 'quality', 'aspect_ratio', 'seed'].includes(key)) {
			payload[key] = value;
		}
	}

	// Handle reference image for img2img
	if (args.reference_image_id) {
		const storageRecord = await db.query.storage.findFirst({
			where: eq(storage.id, args.reference_image_id),
		});

		if (storageRecord && existsSync(storageRecord.path)) {
			const fileBuffer = readFileSync(storageRecord.path);
			const base64 = fileBuffer.toString('base64');
			payload.imageDataUrl = `data:${storageRecord.mimeType};base64,${base64}`;
		}
	}

	// Create generation ID and return immediately
	const generationId = generateId();
	activeGenerations.set(generationId, { status: 'pending' });

	// Fire off generation in the background (same pattern as generate-message)
	(async () => {
		try {
			const res = await fetch(nanoGptUrl('/v1/images/generations'), {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${actualKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errText = await res.text();
				activeGenerations.set(generationId, {
					status: 'error',
					message: `Image generation failed: ${errText}`,
				});
				scheduleCleanup(generationId);
				return;
			}

			const response = await res.json();
			const responseImages = Array.isArray(response.data) ? response.data : [];
			const totalCost = response.cost ?? 0;

			if (responseImages.length === 0) {
				activeGenerations.set(generationId, {
					status: 'error',
					message: 'No images returned from API',
				});
				scheduleCleanup(generationId);
				return;
			}

			// Save images to storage
			const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
			if (!existsSync(UPLOAD_DIR)) {
				mkdirSync(UPLOAD_DIR, { recursive: true });
			}

			const generatedImages: GeneratedImage[] = [];

			for (const image of responseImages) {
				if (!image?.b64_json && !image?.url) continue;

				let buffer: Buffer;
				let mimeType = 'image/png';

				if (image.b64_json) {
					buffer = Buffer.from(image.b64_json, 'base64');
				} else if (image.url) {
					const imgRes = await fetch(image.url);
					if (!imgRes.ok) continue;
					const arrayBuffer = await imgRes.arrayBuffer();
					buffer = Buffer.from(arrayBuffer);
					const contentType = imgRes.headers.get('content-type');
					if (contentType) mimeType = contentType;
				} else {
					continue;
				}

				const storageId = generateId();
				const extension =
					(mimeType.split('/')[1] || 'png').replace(/[^a-zA-Z0-9]/g, '') || 'png';
				const filename = `${storageId}.${extension}`;
				const filepath = join(UPLOAD_DIR, filename);

				if (!resolve(filepath).startsWith(resolve(UPLOAD_DIR))) {
					continue;
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

				const imageIndex = generatedImages.length + 1;
				generatedImages.push({
					url: `/api/storage/${storageId}`,
					storage_id: storageId,
					fileName: `generated-image-${imageIndex}.${extension}`,
				});
			}

			if (generatedImages.length === 0) {
				activeGenerations.set(generationId, {
					status: 'error',
					message: 'Failed to process generated images',
				});
			} else {
				activeGenerations.set(generationId, {
					status: 'complete',
					images: generatedImages,
					cost: totalCost,
				});
			}
			scheduleCleanup(generationId);
		} catch (e) {
			activeGenerations.set(generationId, {
				status: 'error',
				message: e instanceof Error ? e.message : String(e),
			});
			scheduleCleanup(generationId);
		}
	})();

	return json({ generation_id: generationId });
}

// --- GET: poll for generation result ---
export async function GET({ url, request }: RequestEvent) {
	await getAuthenticatedUserId(request);

	const generationId = url.searchParams.get('id');
	if (!generationId) {
		return error(400, 'Missing generation id');
	}

	const status = activeGenerations.get(generationId);
	if (!status) {
		return error(404, 'Generation not found or expired');
	}

	return json(status);
}
