import { json, type RequestHandler } from '@sveltejs/kit';
import { getNanoGPTModels, type NanoGPTModel } from '$lib/backend/models/nano-gpt';
import type { AALLMModel, AAImageModel, AABenchmarkData } from '$lib/types/artificial-analysis';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

let cachedBenchmarks: AABenchmarkData | null = null;
let benchmarkCacheTimestamp = 0;
const BENCHMARK_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchBenchmarkData(): Promise<{
	available: boolean;
	stale?: boolean;
	data: AABenchmarkData;
}> {
	const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
	if (!apiKey) {
		return { available: false, data: { llms: [], imageModels: [] } };
	}

	const now = Date.now();
	if (cachedBenchmarks && now - benchmarkCacheTimestamp < BENCHMARK_CACHE_TTL_MS) {
		return { available: true, data: cachedBenchmarks };
	}

	try {
		const [llmResponse, imageResponse] = await Promise.all([
			fetch('https://artificialanalysis.ai/api/v2/data/llms/models', {
				headers: { 'x-api-key': apiKey },
			}),
			fetch('https://artificialanalysis.ai/api/v2/data/media/text-to-image', {
				headers: { 'x-api-key': apiKey },
			}),
		]);

		let llms: AALLMModel[] = [];
		let imageModels: AAImageModel[] = [];

		if (llmResponse.ok) {
			const llmData = await llmResponse.json();
			llms = llmData.data || [];
		}

		if (imageResponse.ok) {
			const imageData = await imageResponse.json();
			imageModels = imageData.data || [];
		}

		cachedBenchmarks = { llms, imageModels };
		benchmarkCacheTimestamp = now;

		return { available: true, data: cachedBenchmarks };
	} catch (error) {
		console.error('[model-info] Failed to fetch Artificial Analysis benchmarks:', error);

		if (cachedBenchmarks) {
			return { available: true, stale: true, data: cachedBenchmarks };
		}

		return { available: false, data: { llms: [], imageModels: [] } };
	}
}

function normalizeForMatch(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')
		.trim();
}

function stripSuffixes(str: string): string {
	return str
		.replace(/[-_]?original$/i, '')
		.replace(/[-_]?\d{8}$/i, '')
		.trim();
}

function extractModelName(id: string): string {
	const parts = id.split('/');
	const name = (parts.length > 1 ? parts[parts.length - 1] : id) ?? id;
	return stripSuffixes(name);
}

function extractKeyTokens(name: string): Set<string> {
	const normalized = name
		.toLowerCase()
		.replace(/(\d+)\.(\d+)/g, '$1$2')
		.replace(/[^a-z0-9]+/g, ' ');
	const tokens = normalized.split(' ').filter((token) => token.length > 0);
	return new Set(tokens.filter((token) => !/^\d{8,}$/.test(token)));
}

function tokensMatch(set1: Set<string>, set2: Set<string>): boolean {
	if (set1.size === 0 || set2.size === 0) return false;
	let matches = 0;
	for (const token of set1) {
		if (set2.has(token)) matches++;
	}
	return matches >= 2;
}

function isImageOnlyModel(model: NanoGPTModel): boolean {
	return (
		(model.architecture?.output_modalities?.includes('image') &&
			model.architecture?.output_modalities?.length === 1) ??
		false
	);
}

function findBestLlmBenchmark(model: NanoGPTModel, llms: AALLMModel[]): AALLMModel | null {
	if (!llms.length) return null;

	const modelName = stripSuffixes(model.name).toLowerCase();
	const modelIdFull = model.id.toLowerCase();
	const modelIdShort = extractModelName(model.id).toLowerCase();
	const normalizedName = normalizeForMatch(stripSuffixes(model.name));
	const normalizedId = normalizeForMatch(modelIdShort);
	const modelNameTokens = extractKeyTokens(stripSuffixes(model.name));
	const modelIdTokens = extractKeyTokens(modelIdShort);

	let bestMatch: AALLMModel | null = null;
	let bestScore = 0;

	for (const llm of llms) {
		const aaName = llm.name.toLowerCase();
		const aaSlug = llm.slug.toLowerCase();
		const normalizedAaName = normalizeForMatch(llm.name);
		const normalizedAaSlug = normalizeForMatch(llm.slug);

		let score = 0;

		if (modelName === aaName) {
			score = 100;
		} else if (modelIdShort === aaSlug || modelIdFull === aaSlug) {
			score = 100;
		} else if (normalizedName === normalizedAaName) {
			score = 90;
		} else if (normalizedId === normalizedAaSlug) {
			score = 90;
		} else {
			const aaNameTokens = extractKeyTokens(llm.name);
			const aaSlugTokens = extractKeyTokens(llm.slug);

			let nameMatches = 0;
			for (const token of modelNameTokens) {
				if (aaNameTokens.has(token)) nameMatches++;
			}
			let slugMatches = 0;
			for (const token of modelIdTokens) {
				if (aaSlugTokens.has(token)) slugMatches++;
			}

			const maxTokenMatches = Math.max(nameMatches, slugMatches);
			const minTokensNeeded = Math.min(
				modelNameTokens.size,
				modelIdTokens.size,
				aaNameTokens.size,
				aaSlugTokens.size
			);

			if (maxTokenMatches >= 2 && maxTokenMatches >= minTokensNeeded) {
				score = 50 + maxTokenMatches * 10;
			}
		}

		if (score > bestScore) {
			bestScore = score;
			bestMatch = llm;
		}
	}

	return bestMatch && bestScore >= 50 ? bestMatch : null;
}

function findImageBenchmark(model: NanoGPTModel, imageModels: AAImageModel[]): AAImageModel | null {
	if (!imageModels.length) return null;

	const modelName = model.name.toLowerCase();
	const modelIdShort = extractModelName(model.id).toLowerCase();
	const normalizedName = normalizeForMatch(model.name);
	const normalizedId = normalizeForMatch(modelIdShort);
	const modelNameTokens = extractKeyTokens(model.name);
	const modelIdTokens = extractKeyTokens(modelIdShort);

	return (
		imageModels.find((img) => {
			const aaName = img.name.toLowerCase();
			const aaSlug = img.slug.toLowerCase();
			const normalizedAaName = normalizeForMatch(img.name);
			const normalizedAaSlug = normalizeForMatch(img.slug);

			if (modelName === aaName || modelIdShort === aaSlug) return true;
			if (normalizedName === normalizedAaName || normalizedId === normalizedAaSlug) return true;
			if (modelName.includes(aaName) || aaName.includes(modelName)) return true;
			if (modelIdShort.includes(aaSlug) || aaSlug.includes(modelIdShort)) return true;
			if (normalizedName.includes(normalizedAaName) || normalizedAaName.includes(normalizedName)) return true;
			if (normalizedId.includes(normalizedAaSlug) || normalizedAaSlug.includes(normalizedId)) return true;

			const aaNameTokens = extractKeyTokens(img.name);
			const aaSlugTokens = extractKeyTokens(img.slug);
			if (tokensMatch(modelNameTokens, aaNameTokens)) return true;
			if (tokensMatch(modelIdTokens, aaSlugTokens)) return true;
			if (tokensMatch(modelNameTokens, aaSlugTokens)) return true;
			if (tokensMatch(modelIdTokens, aaNameTokens)) return true;

			return false;
		}) ?? null
	);
}

export const GET: RequestHandler = async ({ params, request }) => {
	await getAuthenticatedUserId(request);

	const modelId = params.modelId;
	if (!modelId) {
		return json({ error: 'modelId is required' }, { status: 400 });
	}

	const modelsResult = await getNanoGPTModels();
	const models = modelsResult.unwrapOr([] as NanoGPTModel[]);
	const model = models.find((item) => item.id === modelId);

	if (!model) {
		return json({ error: 'Model not found' }, { status: 404 });
	}

	const outputModalities = model.architecture?.output_modalities || [];
	const capabilities = {
		vision: model.capabilities?.vision ?? false,
		reasoning: model.capabilities?.reasoning ?? false,
		images: outputModalities.includes('image') && outputModalities.length === 1,
		video: outputModalities.includes('video'),
	};

	const benchmarkData = await fetchBenchmarkData();
	const llmBenchmark = isImageOnlyModel(model)
		? null
		: findBestLlmBenchmark(model, benchmarkData.data.llms);
	const imageBenchmark = isImageOnlyModel(model)
		? findImageBenchmark(model, benchmarkData.data.imageModels)
		: null;

	return json({
		model: {
			id: model.id,
			name: model.name,
			description: model.description,
			icon_url: model.icon_url,
			owned_by: model.owned_by,
			context_length: model.context_length,
			max_output_tokens: model.max_output_tokens,
			created: model.created,
			pricing: model.pricing,
			cost_estimate: model.cost_estimate,
			subscription: model.subscription || { included: false, note: '' },
			capabilities,
		},
		benchmarks: {
			available: benchmarkData.available,
			stale: benchmarkData.stale ?? false,
			source: 'artificialanalysis',
			source_url: 'https://artificialanalysis.ai',
			llm: llmBenchmark
				? {
					name: llmBenchmark.name,
					slug: llmBenchmark.slug,
					intelligence: llmBenchmark.evaluations?.artificial_analysis_intelligence_index,
					coding: llmBenchmark.evaluations?.artificial_analysis_coding_index,
					math: llmBenchmark.evaluations?.artificial_analysis_math_index,
					speed_tokens_per_second: llmBenchmark.median_output_tokens_per_second,
				}
				: null,
			image: imageBenchmark
				? {
					name: imageBenchmark.name,
					slug: imageBenchmark.slug,
					elo: imageBenchmark.elo,
					rank: imageBenchmark.rank,
				}
				: null,
		},
	});
};
