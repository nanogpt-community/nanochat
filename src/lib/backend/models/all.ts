import { Provider } from '$lib/types';
import { type NanoGPTModel } from './nano-gpt';

export type ProviderModelMap = {
	[Provider.NanoGPT]: NanoGPTModel;
	[Provider.HuggingFace]: never;
	[Provider.OpenAI]: never;
	[Provider.Anthropic]: never;
};
