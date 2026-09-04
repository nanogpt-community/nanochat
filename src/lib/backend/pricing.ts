import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';

const TTL_MS = 5 * 60 * 1000;

/** USD per million tokens. */
export type PerMillion = { prompt: number; completion: number };

const providerCache = new Map<string, { at: number; value: PerMillion | null }>();

/**
 * Provider-specific pricing. Cached per model+provider: this used to be a live
 * request after every single message. Misses are cached too so an unknown
 * provider doesn't get re-queried per message.
 */
export async function getProviderPricing(
	modelId: string,
	providerId: string,
	apiKey: string
): Promise<PerMillion | null> {
	const key = `${modelId}::${providerId}`;
	const hit = providerCache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

	let value: PerMillion | null = null;
	try {
		const res = await fetch(nanoGptUrl(`/api/models/${encodeURIComponent(modelId)}/providers`), {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (res.ok) {
			const data = await res.json();
			const p = (data.providers as Array<Record<string, unknown>> | undefined)?.find(
				(p) => p.provider === providerId && p.available
			);
			const pricing = p?.pricing as
				{ inputPer1kTokens?: number; outputPer1kTokens?: number } | undefined;
			if (pricing) {
				value = {
					prompt: (pricing.inputPer1kTokens || 0) * 1000,
					completion: (pricing.outputPer1kTokens || 0) * 1000,
				};
			}
		}
	} catch {
		// treated as unknown pricing; caller falls back to catalog pricing
	}
	providerCache.set(key, { at: Date.now(), value });
	return value;
}

export async function getModelPricing(modelId: string): Promise<PerMillion | null> {
	const models = await getNanoGPTModels();
	if (models.isErr()) return null;
	const info = models.value.find((m) => m.id === modelId);
	if (!info?.pricing) return null;
	return {
		prompt: parseFloat(info.pricing.prompt) || 0,
		completion: parseFloat(info.pricing.completion) || 0,
	};
}

function known(p: PerMillion | null): p is PerMillion {
	return p !== null && (p.prompt > 0 || p.completion > 0);
}

/** Cost of one completion in USD; undefined when no pricing is known for the model. */
export async function computeTokenCost(opts: {
	modelId: string;
	providerId?: string | null;
	apiKey: string;
	promptTokens: number;
	completionTokens: number;
}): Promise<number | undefined> {
	let pricing = opts.providerId
		? await getProviderPricing(opts.modelId, opts.providerId, opts.apiKey)
		: null;
	if (!known(pricing)) pricing = await getModelPricing(opts.modelId);
	if (!known(pricing)) return undefined;
	return (
		(opts.promptTokens * pricing.prompt + opts.completionTokens * pricing.completion) / 1_000_000
	);
}
