import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNanoGPTModels, type NanoGPTModel } from '$lib/backend/models/nano-gpt';
import { getEnabledModels } from '$lib/db/queries/user-enabled-models';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// GET - get all models with capabilities and enabled status
export const GET: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);

	// Get all available models from NanoGPT API
	const nanoGPTModelsResult = await getNanoGPTModels();
	const nanoGPTModels = nanoGPTModelsResult.unwrapOr([] as NanoGPTModel[]);

	// Get user's enabled models from database
	const enabledModelsMap = await getEnabledModels(userId);

	// Merge the data: add enabled/pinned info to each model
	const models = nanoGPTModels.map((model) => {
		const key = `nanogpt:${model.id}`;
		const enabledModel = enabledModelsMap[key];

		// Check capabilities based on architecture if not explicitly set
		const outputModalities = model.architecture?.output_modalities || [];

		const capabilities = {
			vision: model.capabilities?.vision ?? false,
			reasoning: model.capabilities?.reasoning ?? false,
			// Add explicit image/video generation capabilities
			images: outputModalities.includes('image') && outputModalities.length === 1,
			video: outputModalities.includes('video'),
		};

		return {
			...model,
			capabilities,
			// Ensure subscription info is always present with defaults
			subscription: model.subscription || { included: false, note: '' },
			enabled: !!enabledModel,
			pinned: enabledModel?.pinned ?? false,
		};
	});

	return json(models);
};
