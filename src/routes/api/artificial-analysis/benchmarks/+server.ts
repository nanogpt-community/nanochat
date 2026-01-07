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
        // Fetch LLM and image model data in parallel
        const [llmResponse, imageResponse] = await Promise.all([
            fetch('https://artificialanalysis.ai/api/v2/data/llms/models', {
                headers: { 'x-api-key': apiKey }
            }),
            fetch('https://artificialanalysis.ai/api/v2/data/media/text-to-image', {
                headers: { 'x-api-key': apiKey }
            })
        ]);

        let llms: AALLMModel[] = [];
        let imageModels: AAImageModel[] = [];

        if (llmResponse.ok) {
            const llmData = await llmResponse.json();
            llms = llmData.data || [];
        } else {
            console.error('Failed to fetch LLM benchmarks:', llmResponse.status);
        }

        if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            imageModels = imageData.data || [];
        } else {
            console.error('Failed to fetch image model benchmarks:', imageResponse.status);
        }

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
