import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';

export function supportsImages(model: NanoGPTModel): boolean {
	return true;
}

export function supportsReasoning(model: NanoGPTModel): boolean {
	// NanoGPT models don't expose supported_parameters yet in our mock, 
	// so we'll default to false or check id conventions if needed.
	return false;
}

export function getImageSupportedModels(models: NanoGPTModel[]): NanoGPTModel[] {
	return models.filter(supportsImages);
}
