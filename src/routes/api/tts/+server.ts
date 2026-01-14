import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { modelPerformanceStats } from '$lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';

const COST_PER_1K_CHARS: Record<string, number> = {
	'gpt-4o-mini-tts': 0.0125,
	'tts-1': 0.015,
	'tts-1-hd': 0.03,
	'Kokoro-82m': 0.001,
	'Elevenlabs-Turbo-V2.5': 0.06,
};

// Default to standard price if unknown
const DEFAULT_COST = 0.015;

const getApiKey = (request: Request): string | null => {
	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token.length > 0) {
			return token;
		}
	}

	return request.headers.get('x-api-key') || env.NANOGPT_API_KEY || null;
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	let textStr = '';
	let modelId = 'tts-1';

	try {
		const body = await request.json();
		const { text, model = 'tts-1', voice = 'alloy', speed = 1.0 } = body;
		textStr = text || '';
		modelId = model;

		if (!text) {
			return json({ error: 'Text is required' }, { status: 400 });
		}

		const apiKey = getApiKey(request);

		if (!apiKey) {
			return json({ error: 'API key is required' }, { status: 401 });
		}

		const start = Date.now();
		const response = await fetch('https://nano-gpt.com/api/v1/audio/speech', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				input: text,
				voice,
				speed,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('[TTS] API Error:', error);
			return json(
				{ error: `NanoGPT API Error: ${response.statusText}` },
				{ status: response.status }
			);
		}

		const contentType = response.headers.get('Content-Type') || '';
		if (response.status === 202 || contentType.includes('application/json')) {
			const data = await response.json();
			return json(data, { status: response.status });
		}

		// Return the audio blob directly
		console.log(
			`[TTS] API response status: ${response.status}, headers:`,
			Object.fromEntries(response.headers.entries())
		);
		const audioBlob = await response.blob();

		// Track analytics asynchronously
		(async () => {
			try {
				const userId = await tryGetAuthenticatedUserId(request);
				if (userId) {
					console.log(`[TTS] Tracking analytics for user: ${userId}, model: ${model}`);
					const duration = Date.now() - start;

					// Try to get cost from various response headers
					let cost = 0;
					const costHeaders = ['x-cost', 'x-charged', 'cost', 'charged', 'x-charge', 'charge'];

					for (const header of costHeaders) {
						const value = response.headers.get(header);
						if (value) {
							const parsed = parseFloat(value);
							if (!isNaN(parsed)) {
								cost = parsed;
								console.log(`[TTS] Got cost from header '${header}': $${cost}`);
								break;
							}
						}
					}

					// If no cost in headers, estimate based on characters (pricing may vary)
					if (cost === 0) {
						const costPer1k = COST_PER_1K_CHARS[model] || DEFAULT_COST;
						// Calculate cost based on characters (text length)
						cost = (textStr.length / 1000) * costPer1k;
						console.log(
							`[TTS] No cost in headers, estimating from text: length=${textStr.length}, costPer1k=$${costPer1k}, estimated cost=$${cost}`
						);
					}

					const provider = 'nano-gpt';

					const existing = await db
						.select()
						.from(modelPerformanceStats)
						.where(
							and(
								eq(modelPerformanceStats.userId, userId),
								eq(modelPerformanceStats.modelId, model),
								eq(modelPerformanceStats.provider, provider)
							)
						)
						.get();

					if (existing) {
						await db
							.update(modelPerformanceStats)
							.set({
								totalMessages: sql`${modelPerformanceStats.totalMessages} + 1`,
								totalCost: sql`${modelPerformanceStats.totalCost} + ${cost}`,
								lastUpdated: new Date(),
							})
							.where(eq(modelPerformanceStats.id, existing.id));
					} else {
						await db.insert(modelPerformanceStats).values({
							id: crypto.randomUUID(),
							userId,
							modelId: model,
							provider,
							totalMessages: 1,
							totalCost: cost, // Ensure this matches schema type (real)
							avgTokens: 0,
							avgResponseTime: duration,
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
					console.log(`[TTS] Analytics updated for ${model}`);
				} else {
					console.warn('[TTS] No session found, skipping analytics');
				}
			} catch (e) {
				console.error('[TTS] Analytics Error:', e);
			}
		})();

		return new Response(audioBlob, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Content-Length': audioBlob.size.toString(),
			},
		});
	} catch (error) {
		console.error('[TTS] Server Error:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
