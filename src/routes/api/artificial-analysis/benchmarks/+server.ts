import { json, type RequestHandler } from '@sveltejs/kit';
import type { AALLMModel, AAImageModel, AABenchmarkData } from '$lib/types/artificial-analysis';

// Server-side cache for benchmark data
let cachedData: AABenchmarkData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * GET /api/artificial-analysis/benchmarks
 * Fetches and caches benchmark data from Artificial Analysis API
 * Returns combined LLM and image model benchmarks
 */
export const GET: RequestHandler = async () => {
    const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;

    // Return empty if no API key configured
    if (!apiKey) {
        return json({ llms: [], imageModels: [], available: false });
    }

    // Check cache
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return json({ ...cachedData, available: true });
    }

    try {
        // Fetch LLM (paginated) and image model data in parallel.
        // Free-tier endpoints accept any key tier and include all fields we use.
        const [llms, imageModels] = await Promise.all([
            (async () => {
                const models: AALLMModel[] = [];
                let page = 1;
                let hasMore = true;
                while (hasMore) {
                    const res = await fetch(`https://artificialanalysis.ai/api/v2/language/models/free?page=${page}`, {
                        headers: { 'x-api-key': apiKey }
                    });
                    if (!res.ok) {
                        console.error('Failed to fetch LLM benchmarks:', res.status);
                        break;
                    }
                    const body = await res.json();
                    // Flatten nested performance medians to keep the legacy shape consumers use
                    for (const m of body.data || []) {
                        models.push({
                            ...m,
                            median_output_tokens_per_second: m.performance?.median_output_tokens_per_second,
                            median_time_to_first_token_seconds: m.performance?.median_time_to_first_token_seconds
                        });
                    }
                    hasMore = body.pagination?.has_more === true;
                    page++;
                }
                return models;
            })(),
            (async () => {
                const res = await fetch('https://artificialanalysis.ai/api/v2/media/text-to-image/models/free', {
                    headers: { 'x-api-key': apiKey }
                });
                if (!res.ok) {
                    console.error('Failed to fetch image model benchmarks:', res.status);
                    return [] as AAImageModel[];
                }
                const body = await res.json();
                // The V2 API no longer returns rank; derive it from Elo order
                const models: AAImageModel[] = (body.data || []).sort(
                    (a: AAImageModel, b: AAImageModel) => (b.elo ?? 0) - (a.elo ?? 0)
                );
                return models.map((m, i) => ({ ...m, rank: i + 1 }));
            })()
        ]);

        // Update cache
        cachedData = { llms, imageModels };
        cacheTimestamp = now;

        return json({ ...cachedData, available: true });
    } catch (error) {
        console.error('Error fetching Artificial Analysis benchmarks:', error);

        // Return cached data if available, even if stale
        if (cachedData) {
            return json({ ...cachedData, available: true, stale: true });
        }

        return json({ llms: [], imageModels: [], available: false, error: 'Failed to fetch benchmarks' });
    }
};
