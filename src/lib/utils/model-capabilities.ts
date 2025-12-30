import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';

export function supportsImages(model: NanoGPTModel): boolean {
	if (model.architecture?.output_modalities && !model.architecture.output_modalities.includes('image')) {
		return false;
	}
	return true;
}

export function supportsVideo(model: NanoGPTModel): boolean {
	return model.architecture?.output_modalities?.includes('video') ?? false;
}

export function supportsVision(model: NanoGPTModel): boolean {
	return model.architecture?.input_modalities?.includes('image') ?? false;
}

export function isImageOnlyModel(model: NanoGPTModel): boolean {
	return (model.architecture?.output_modalities?.includes('image') &&
		model.architecture?.output_modalities?.length === 1) ?? false;
}

export function supportsReasoning(model: NanoGPTModel): boolean {
	return false;
}

export function supportsDocuments(model: NanoGPTModel): boolean {
	// For now, assume all models that support images also support documents
	// This can be refined later based on specific model capabilities
	return supportsImages(model);
}

export function getImageSupportedModels(models: NanoGPTModel[]): NanoGPTModel[] {
	return models.filter(supportsImages);
}

export function getVideoSupportedModels(models: NanoGPTModel[]): NanoGPTModel[] {
	return models.filter(supportsVideo);
}
