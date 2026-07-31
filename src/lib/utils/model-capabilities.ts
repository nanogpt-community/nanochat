import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';

export function supportsImages(model: NanoGPTModel): boolean {
	if (
		model.architecture?.output_modalities &&
		!model.architecture.output_modalities.includes('image')
	) {
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
	return (
		(model.architecture?.output_modalities?.includes('image') &&
			model.architecture?.output_modalities?.length === 1) ??
		false
	);
}

// https://docs.nano-gpt.com/api-reference/endpoint/chat-completion#reasoning-effort
// Providers disagree on the top rung: OpenAI-style models take 'xhigh', others (e.g.
// deepseek-v4-flash:thinking) take 'max' and reject 'xhigh'. Offer both, send verbatim.
export const REASONING_EFFORTS = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
	'max',
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

// 'auto' is UI-only: omit the param and let the provider decide.
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort | 'auto', string> = {
	auto: 'Auto',
	none: 'Off',
	minimal: 'Minimal',
	low: 'Low',
	medium: 'Medium',
	high: 'High',
	xhigh: 'XHigh',
	max: 'Max',
};

export function supportsReasoning(model: NanoGPTModel): boolean {
	return model.capabilities?.reasoning ?? false;
}

export function supportsVerbosity(model: NanoGPTModel): boolean {
	return model.additionalParams?.verbosity !== undefined;
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
