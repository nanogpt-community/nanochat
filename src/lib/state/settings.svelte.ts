import { createPersistedObj } from '$lib/spells/persisted-obj.svelte';
import type { ReasoningEffort } from '$lib/utils/model-capabilities';

export const settings = createPersistedObj('settings', {
	modelId: undefined as string | undefined,
	providerId: undefined as string | undefined, // X-Provider header value for provider selection
	webSearchMode: 'off' as 'off' | 'standard' | 'deep',
	webSearchProvider: 'linkup' as
		| 'linkup'
		| 'tavily'
		| 'exa'
		| 'kagi'
		| 'perplexity'
		| 'valyu'
		| 'brave'
		| 'brave-pro'
		| 'brave-research',
	webSearchExaDepth: 'auto' as 'fast' | 'auto' | 'neural' | 'deep',
	webSearchContextSize: 'medium' as 'low' | 'medium' | 'high',
	webSearchKagiSource: 'web' as 'web' | 'news' | 'search',
	webSearchValyuSearchType: 'all' as 'all' | 'web',
	reasoningEffort: 'auto' as ReasoningEffort | 'auto',
	theme: undefined as string | undefined,
	temporaryMode: false as boolean,
	ttsVoice: 'alloy' as string,
	ttsSpeed: 1.0 as number,
	ttsModel: 'tts-1' as string,
	sttModel: 'Whisper-Large-V3' as string,
});
