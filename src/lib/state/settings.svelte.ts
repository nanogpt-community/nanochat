import { createPersistedObj } from '$lib/spells/persisted-obj.svelte';

export const settings = createPersistedObj('settings', {
	modelId: undefined as string | undefined,
	webSearchMode: 'off' as 'off' | 'standard' | 'deep',
	webSearchProvider: 'linkup' as 'linkup' | 'tavily' | 'exa' | 'kagi',
	reasoningEffort: 'low' as 'low' | 'medium' | 'high',
	theme: undefined as string | undefined,
});
