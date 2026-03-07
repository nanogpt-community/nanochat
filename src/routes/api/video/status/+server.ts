import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { modelPerformanceStats } from '$lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getUserKey } from '$lib/db/queries';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';

const getExplicitNanoGPTKey = (request: Request): string | null => {
	const headerKey = request.headers.get('x-api-key');
	if (headerKey && !headerKey.startsWith('nc_')) {
		return headerKey;
	}

	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token.length > 0 && !token.startsWith('nc_')) {
			return token;
		}
	}

	return null;
};

const resolveNanoGPTKey = async (request: Request, userId?: string): Promise<string | null> => {
	const explicitKey = getExplicitNanoGPTKey(request);
	if (explicitKey) return explicitKey;

	if (!userId) return null;

	const userKey = await getUserKey(userId, 'nanogpt');
	return userKey || env.NANOGPT_API_KEY || null;
};

export const GET: RequestHandler = async ({ request, url, fetch }) => {
    try {
        const runId = url.searchParams.get('runId');
        const model = url.searchParams.get('model');

        if (!runId) {
            return json({ error: 'runId is required' }, { status: 400 });
        }

        const userId = await tryGetAuthenticatedUserId(request);
        const apiKey = await resolveNanoGPTKey(request, userId);
        if (!apiKey) {
            return json({ error: 'Authentication required or NanoGPT API key missing' }, { status: 401 });
        }

        // Construct target URL
        const targetUrl = new URL(nanoGptUrl('/api/generate-video/status'));
        targetUrl.searchParams.set('runId', runId);
        // if (model) targetUrl.searchParams.set('model', model); // Try without model filtering

        const response = await fetch(targetUrl.toString(), {
            method: 'GET',
            headers: {
                'x-api-key': apiKey
            }
        });

        if (!response.ok) {
            return json({ error: `NanoGPT Status Error: ${response.statusText}` }, { status: response.status });
        }

        const data = await response.json();
        const status = data.data?.status;

        // Analytics if COMPLETED
        // Note: To avoid double counting, we ideally check if we already logged this. 
        // But for now, we rely on client behavior or accept minor overcounting on refreshes.
        if (status === 'COMPLETED' && userId) {
                const cost = data.data?.cost || 0;
                // Note: 'model' param might be user provided, check data.model or fallback
                const modelId = data.data?.model || model || 'unknown-video-model';

                try {
                    const existing = await db.select().from(modelPerformanceStats).where(
                        and(
                            eq(modelPerformanceStats.userId, userId),
                            eq(modelPerformanceStats.modelId, modelId),
                            eq(modelPerformanceStats.provider, 'nanogpt')
                        )
                    ).get();

                    if (existing) {
                        await db.update(modelPerformanceStats).set({
                            totalMessages: sql`${modelPerformanceStats.totalMessages} + 1`,
                            totalCost: sql`${modelPerformanceStats.totalCost} + ${cost}`,
                            lastUpdated: new Date()
                        }).where(eq(modelPerformanceStats.id, existing.id));
                    } else {
                        await db.insert(modelPerformanceStats).values({
                            id: crypto.randomUUID(),
                            userId,
                            modelId,
                            provider: 'nanogpt',
                            totalMessages: 1,
                            totalCost: cost,
                            lastUpdated: new Date(),
                            errorCount: 0,
                            thumbsUpCount: 0,
                            thumbsDownCount: 0,
                            regenerateCount: 0,
                            accurateCount: 0,
                            helpfulCount: 0,
                            creativeCount: 0,
                            fastCount: 0,
                            costEffectiveCount: 0,
                        });
                    }
                } catch (e) {
                    console.error('[Video Status] Analytics Error:', e);
                }
        }

        return json(data);
    } catch (error) {
        console.error('[Video Status] Server Error:', error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
