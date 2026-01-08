import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { modelPerformanceStats } from '$lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { auth } from '$lib/auth';

const COST_PER_MINUTE: Record<string, number> = {
    'Whisper-Large-V3': 0.01,
    'Wizper': 0.01,
    'Elevenlabs-STT': 0.03
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

        const apiKey = request.headers.get('x-api-key') || env.NANOGPT_API_KEY;

        if (!apiKey) {
            return json({ error: 'API key is required' }, { status: 401 });
        }

        const start = Date.now();
        const response = await fetch('https://nano-gpt.com/api/transcribe', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                // Do NOT set Content-Type, allow fetch to set boundary automatically with FormData
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[STT] API Error:', errorText);
            try {
                const jsonError = JSON.parse(errorText);
                return json({ error: jsonError.error || 'NanoGPT API Error' }, { status: response.status });
            } catch {
                return json({ error: `NanoGPT API Error: ${response.statusText}`, details: errorText }, { status: response.status });
            }
        }

        const data = await response.json();

        // Track analytics asynchronously
        (async () => {
            try {
                const session = await auth.api.getSession({ headers: request.headers });
                if (session?.user?.id) {
                    const userId = session.user.id;
                    const durationMs = Date.now() - start;

                    // Cost from metadata if available, else estimate
                    let cost = data.metadata?.cost;
                    if (cost === undefined) {
                        // Estimate based on chargedDuration?
                        const durationMins = data.metadata?.chargedDuration || 0;
                        const rate = COST_PER_MINUTE[model] || 0.01;
                        cost = durationMins * rate;
                    }

                    const provider = 'nano-gpt';

                    const existing = await db.select().from(modelPerformanceStats).where(
                        and(
                            eq(modelPerformanceStats.userId, userId),
                            eq(modelPerformanceStats.modelId, model),
                            eq(modelPerformanceStats.provider, provider)
                        )
                    ).get();

                    if (existing) {
                        await db.update(modelPerformanceStats).set({
                            totalMessages: sql`${modelPerformanceStats.totalMessages} + 1`, // Count as 1 message/usage
                            totalCost: sql`${modelPerformanceStats.totalCost} + ${cost}`,
                            lastUpdated: new Date()
                        }).where(eq(modelPerformanceStats.id, existing.id));
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
                            lastUpdated: new Date()
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
