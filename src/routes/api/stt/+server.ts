import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { modelPerformanceStats } from '$lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getUserKey } from '$lib/db/queries';

const COST_PER_MINUTE: Record<string, number> = {
	'Whisper-Large-V3': 0.01,
	Wizper: 0.01,
	'Elevenlabs-STT': 0.03,
};

type ResolvedNanoGPTKey = {
	value: string;
	source: 'authorization' | 'x-api-key' | 'derived';
};

const getExplicitNanoGPTKey = (request: Request): ResolvedNanoGPTKey | null => {
	const headerKey = request.headers.get('x-api-key');
	if (headerKey && !headerKey.startsWith('nc_')) {
		return { value: headerKey, source: 'x-api-key' };
	}

	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token.length > 0 && !token.startsWith('nc_')) {
			return { value: token, source: 'authorization' };
		}
	}

	return null;
};

const resolveNanoGPTKey = async (
	request: Request,
	userId?: string
): Promise<ResolvedNanoGPTKey | null> => {
	const explicitKey = getExplicitNanoGPTKey(request);
	if (explicitKey) return explicitKey;

	if (!userId) return null;

	const userKey = await getUserKey(userId, 'nanogpt');
	const derivedKey = userKey || env.NANOGPT_API_KEY;
	return derivedKey ? { value: derivedKey, source: 'derived' } : null;
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	try {
		const formData = await request.formData();
		const audio = formData.get('audio');
		let model = (formData.get('model') as string) || 'Whisper-Large-V3';
		const language = (formData.get('language') as string) || 'auto';

		if (!audio) {
			return json({ error: 'Audio file is required' }, { status: 400 });
		}

		// Ensure model is set in case client didn't send it
		if (!formData.has('model')) {
			formData.set('model', model);
		}
		if (!formData.has('language')) {
			formData.set('language', language);
		}

		const userId = await tryGetAuthenticatedUserId(request);
		const resolvedKey = await resolveNanoGPTKey(request, userId);

		if (!resolvedKey) {
			return json({ error: 'Authentication required or NanoGPT API key missing' }, { status: 401 });
		}

		const upstreamHeaders: Record<string, string> = {};
		// NanoGPT STT expects x-api-key; only use Authorization when explicitly provided.
		if (resolvedKey.source === 'authorization') {
			upstreamHeaders.Authorization = `Bearer ${resolvedKey.value}`;
		} else {
			upstreamHeaders['x-api-key'] = resolvedKey.value;
		}

		const start = Date.now();
		const response = await fetch('https://nano-gpt.com/api/transcribe', {
			method: 'POST',
			headers: upstreamHeaders,
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('[STT] API Error:', errorText);
			try {
				const jsonError = JSON.parse(errorText);
				return json({ error: jsonError.error || 'NanoGPT API Error' }, { status: response.status });
			} catch {
				return json(
					{ error: `NanoGPT API Error: ${response.statusText}`, details: errorText },
					{ status: response.status }
				);
			}
		}

		console.log(
			`[STT] API response status: ${response.status}, headers:`,
			Object.fromEntries(response.headers.entries())
		);
		const data = await response.json();

		// Track analytics asynchronously
		(async () => {
			try {
				if (userId) {
					const durationMs = Date.now() - start;

					// Try to get cost from various response headers
					let cost = undefined;
					const costHeaders = ['x-cost', 'x-charged', 'cost', 'charged', 'x-charge', 'charge'];

					for (const header of costHeaders) {
						const value = response.headers.get(header);
						if (value) {
							const parsed = parseFloat(value);
							if (!isNaN(parsed)) {
								cost = parsed;
								console.log(`[STT] Got cost from header '${header}': $${cost}`);
								break;
							}
						}
					}

					// Cost from metadata if available, else estimate
					if (cost === undefined) {
						cost = data.metadata?.cost;
						if (cost !== undefined) {
							console.log(`[STT] Got cost from metadata: $${cost}`);
						}
					}

					if (cost === undefined || isNaN(cost)) {
						// Estimate based on chargedDuration?
						const durationMins = data.metadata?.chargedDuration || 0;
						const rate = COST_PER_MINUTE[model] || 0.01;
						cost = durationMins * rate;
						console.log(
							`[STT] No cost in headers/metadata, estimating from duration: ${durationMins}min at $${rate}/min = $${cost}`
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
								totalMessages: sql`${modelPerformanceStats.totalMessages} + 1`, // Count as 1 message/usage
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
							totalCost: cost || 0,
							avgTokens: 0,
							avgResponseTime: durationMs,
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
					console.log(`[STT] Analytics updated for ${model}`);
				}
			} catch (e) {
				console.error('[STT] Analytics Error:', e);
			}
		})();

		return json(data);
	} catch (error) {
		console.error('[STT] Server Error:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
