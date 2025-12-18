import { page } from '$app/state';
import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
import type { ProviderModelMap } from '$lib/backend/models/all';
import { createInit } from '$lib/spells/create-init.svelte';
import { Provider } from '$lib/types';
import { watch } from 'runed';
import { session } from './session.svelte';

// Helper function to generate model key
function getModelKey(opts: { provider: string; modelId: string }): string {
	return `${opts.provider}:${opts.modelId}`;
}

export class Models {
	enabled = $state({} as Record<string, unknown>);

	init = createInit(() => {
		const query = useCachedQuery(api.user_enabled_models.get_enabled, {});
		watch(
			() => $state.snapshot(query.data),
			(data) => {
				if (data) this.enabled = data;
			}
		);
	});

	from<P extends Provider>(provider: Provider) {
		const providerModels = page.data?.models?.[provider];
		if (!providerModels || !Array.isArray(providerModels)) {
			return [] as Array<ProviderModelMap[P] & { enabled: boolean }>;
		}
		return providerModels.map((m: { id: string }) => {
			return {
				...m,
				enabled: this.enabled[getModelKey({ provider, modelId: m.id })] !== undefined,
			};
		}) as Array<ProviderModelMap[P] & { enabled: boolean }>;
	}
}

export const models = new Models();
