import { getNanoGPTModels, type NanoGPTModel } from '$lib/backend/models/nano-gpt';
import { Provider } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const [session, nanoGPTModels] = await Promise.all([locals.auth(), getNanoGPTModels()]);

	return {
		session,
		models: {
			[Provider.NanoGPT]: nanoGPTModels.unwrapOr([] as NanoGPTModel[]),
		},
	};
};

// Makes caching easier, and tbf, we don't need SSR anyways here
export const ssr = true;
