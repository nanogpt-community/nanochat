import { db, generateId } from '$lib/db';
import { conversations, messages, storage } from '$lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
import type { GenerateMessageRequestBody, Log } from './schema';

async function readStorageBuffer(path: string): Promise<Buffer> {
	return Buffer.from(await readFile(path));
}

/**
 * Image-model turn: calls the images endpoint, stores the results, and fills in
 * the placeholder assistant message. Caller handles errors and the placeholder.
 */
export async function generateImageResponse({
	args,
	userId,
	conversationId,
	assistantMessageId,
	apiKey,
	modelInfo,
	log,
}: {
	args: GenerateMessageRequestBody;
	userId: string;
	conversationId: string;
	assistantMessageId: string;
	apiKey: string;
	modelInfo: NanoGPTModel | undefined;
	log: Log;
}): Promise<void> {
	let imageDataUrl: string | undefined;

	// Check for input image (img2img)
	if (args.images && args.images.length > 0) {
		const inputImage = args.images[0]!;
		const storageRecord = await db.query.storage.findFirst({
			where: and(eq(storage.id, inputImage.storage_id), eq(storage.userId, userId)),
		});

		if (storageRecord) {
			const fileBuffer = await readStorageBuffer(storageRecord.path);
			const base64 = fileBuffer.toString('base64');
			imageDataUrl = `data:${storageRecord.mimeType};base64,${base64}`;
			log('Prepared input image for img2img');
		}
	}

	const rawImageCount = args.image_params?.nImages;
	const parsedImageCount =
		typeof rawImageCount === 'number' ? rawImageCount : Number(rawImageCount);
	const normalizedImageCount = Number.isFinite(parsedImageCount)
		? Math.max(1, Math.floor(parsedImageCount))
		: 1;
	const maxImages =
		typeof modelInfo?.maxImages === 'number' && Number.isFinite(modelInfo.maxImages)
			? modelInfo.maxImages
			: undefined;
	const imageCount = maxImages ? Math.min(normalizedImageCount, maxImages) : normalizedImageCount;

	const payloadBase: any = {
		model: args.model_id,
		prompt: args.message || 'Image',
		response_format: 'b64_json',
		size: args.image_params?.resolution || '1024x1024',
	};

	// Include additional params from image settings
	if (args.image_params?.quality) {
		payloadBase.quality = args.image_params.quality;
	}
	if (args.image_params?.aspect_ratio) {
		payloadBase.aspect_ratio = args.image_params.aspect_ratio;
	}
	if (args.image_params?.seed !== undefined) {
		const rawSeed = args.image_params.seed;
		const parsedSeed = typeof rawSeed === 'number' ? rawSeed : Number(rawSeed);
		if (Number.isFinite(parsedSeed) && parsedSeed !== -1) {
			payloadBase.seed = parsedSeed;
		}
	}

	if (imageDataUrl) {
		payloadBase.imageDataUrl = imageDataUrl;
	}

	const requestImages = async (count: number) => {
		const payload = { ...payloadBase, n: count };
		const res = await fetch(nanoGptUrl('/v1/images/generations'), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`NanoGPT API error: ${res.status} ${errText}`);
		}

		const response = await res.json();
		const responseImages = response.data ?? [];
		return {
			images: Array.isArray(responseImages) ? responseImages : [],
			cost: response.cost ?? 0,
		};
	};

	// Ensure upload dir exists
	const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
	await mkdir(UPLOAD_DIR, { recursive: true });

	const requestedImageCount = imageCount;
	const generatedImages: Array<{ url: string; storage_id: string; fileName?: string }> = [];
	let remaining = requestedImageCount;
	let totalCost = 0;
	let attempts = 0;
	const maxAttempts = 2;

	while (remaining > 0 && attempts < maxAttempts) {
		const { images: responseImages, cost } = await requestImages(remaining);
		totalCost += cost;
		if (responseImages.length === 0) break;

		for (const image of responseImages) {
			if (!image?.b64_json && !image?.url) {
				console.warn('Skipping image without data:', image);
				continue;
			}

			let buffer: Buffer;
			let mimeType = 'image/png';

			if (image.b64_json) {
				buffer = Buffer.from(image.b64_json, 'base64');
			} else if (image.url) {
				// Fallback download
				const imgRes = await fetch(image.url);
				if (!imgRes.ok) {
					console.warn('Failed to download image:', imgRes.status, image.url);
					continue;
				}
				const arrayBuffer = await imgRes.arrayBuffer();
				buffer = Buffer.from(arrayBuffer);
				const contentType = imgRes.headers.get('content-type');
				if (contentType) mimeType = contentType;
			} else {
				continue;
			}

			const storageId = generateId();
			const extension = (mimeType.split('/')[1] || 'png').replace(/[^a-zA-Z0-9]/g, '') || 'png';
			const filename = `${storageId}.${extension}`;
			const filepath = join(UPLOAD_DIR, filename);

			// Prevent path traversal
			if (!resolve(filepath).startsWith(resolve(UPLOAD_DIR))) {
				throw new Error('Invalid file path');
			}

			await writeFile(filepath, buffer);

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
			const imageIndex = generatedImages.length + 1;
			generatedImages.push({
				url: imageUrl,
				storage_id: storageId,
				fileName: `generated-image-${imageIndex}.${extension}`,
			});
		}

		remaining = requestedImageCount - generatedImages.length;
		attempts += 1;
	}

	log(`Image generation cost: $${totalCost}`);

	if (generatedImages.length === 0) {
		throw new Error('No valid image data returned from API');
	}

	const textContent =
		generatedImages.length !== requestedImageCount
			? `Generated Image${generatedImages.length > 1 ? 's' : ''} (${generatedImages.length} of ${requestedImageCount})`
			: generatedImages.length > 1
				? `Generated Images (${generatedImages.length})`
				: 'Generated Image';

	await db
		.update(messages)
		.set({
			content: textContent,
			contentHtml: null,
			tokenCount: 0,
			images: generatedImages,
			costUsd: totalCost,
		})
		.where(eq(messages.id, assistantMessageId));

	await db
		.update(conversations)
		.set({
			generating: false,
			updatedAt: new Date(),
			costUsd: sql`COALESCE(${conversations.costUsd}, 0) + ${totalCost}`,
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

		log(`Image generation: Updated title to "${capitalizedTitle}"`);
	}

	log('Image generation completed');
}
