import { createPersistedObj } from '$lib/spells/persisted-obj.svelte';

export const settings = createPersistedObj('settings', {
	modelId: undefined as string | undefined,
	providerId: undefined as string | undefined, // X-Provider header value for provider selection
	webSearchMode: 'off' as 'off' | 'standard' | 'deep',
	webSearchProvider: 'linkup' as 'linkup' | 'tavily' | 'exa' | 'kagi',
	reasoningEffort: 'low' as 'low' | 'medium' | 'high',
	theme: undefined as string | undefined,
	temporaryMode: false as boolean,
	ttsVoice: 'alloy' as string,
	ttsSpeed: 1.0 as number,
	ttsModel: 'tts-1' as string,
	sttModel: 'Whisper-Large-V3' as string,
});

