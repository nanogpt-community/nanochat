import { getNanoGPTModels, type NanoGPTModel } from '$lib/backend/models/nano-gpt';
import { isSubscriptionOnlyMode, isWebDisabledForServerKey, getDailyMessageLimit } from '$lib/backend/message-limits';
import { getUserKey } from '$lib/db/queries/user-keys';
import { Provider } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const [session, nanoGPTModels] = await Promise.all([locals.auth(), getNanoGPTModels()]);

	let models = nanoGPTModels.unwrapOr([] as NanoGPTModel[]);

	// Check if user has their own NanoGPT API key
	let hasOwnApiKey = false;
	let usingServerKey = false;

	if (session?.user?.id) {
		const userKey = await getUserKey(session.user.id, 'nanogpt');
		hasOwnApiKey = !!userKey;
		usingServerKey = !hasOwnApiKey && !!process.env.NANOGPT_API_KEY;
	} else {
		// Not logged in - check if server has API key
		usingServerKey = !!process.env.NANOGPT_API_KEY;
	}

	// Filter to subscription-only models if enabled and user is using server key
	const subscriptionOnly = isSubscriptionOnlyMode() && usingServerKey;
	if (subscriptionOnly) {
		models = models.filter((m) => m.subscription?.included === true);
	}

	// Pass restrictions info to the client
	const restrictions = {
		subscriptionOnly,
		webDisabled: usingServerKey && isWebDisabledForServerKey(),
		dailyLimit: usingServerKey ? getDailyMessageLimit() : 0,
		usingServerKey,
	};

	return {
		session,
		models: {
			[Provider.NanoGPT]: models,
		},
		restrictions,
	};
};

// Makes caching easier, and tbf, we don't need SSR anyways here
export const ssr = true;
