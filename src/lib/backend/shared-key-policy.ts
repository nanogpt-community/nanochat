import { error } from '@sveltejs/kit';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';
import { checkAndUpdateDailyLimit, isSubscriptionOnlyMode } from '$lib/backend/message-limits';

export type SharedKeyDenial = { status: 403 | 429; message: string };

/** In subscription-only mode the operator's key may only be spent on subscription-included models. */
export async function sharedKeyModelAllowed(modelId: string | null | undefined): Promise<boolean> {
	if (!isSubscriptionOnlyMode()) return true;
	if (!modelId) return false;
	const models = await getNanoGPTModels();
	if (models.isErr()) return false;
	return models.value.find((m) => m.id === modelId)?.subscription?.included === true;
}

/**
 * The one gate for spending NANOGPT_API_KEY. Chat, images, audio, video, and the
 * utility calls all pass through it so the daily quota and the subscription-only
 * model policy can't be sidestepped by picking a different endpoint.
 *
 * Returns a denial rather than throwing so background work can skip quietly.
 */
export async function checkSharedKeyUse(opts: {
	userId: string;
	usingServerKey: boolean;
	modelId?: string | null;
	/** Set false for calls that ride on an already-counted chat turn. */
	consumeQuota?: boolean;
}): Promise<SharedKeyDenial | null> {
	if (!opts.usingServerKey) return null;

	if (!(await sharedKeyModelAllowed(opts.modelId))) {
		return {
			status: 403,
			message:
				'This model is not available with the server API key. Add your own NanoGPT API key in Settings > Models.',
		};
	}

	if (opts.consumeQuota !== false) {
		const limit = await checkAndUpdateDailyLimit(opts.userId, true, true);
		if (!limit.allowed) {
			return { status: 429, message: limit.error ?? 'Daily message limit reached' };
		}
	}
	return null;
}

/** Endpoint form: throws the matching HTTP error. */
export async function assertSharedKeyUse(
	opts: Parameters<typeof checkSharedKeyUse>[0]
): Promise<void> {
	const denial = await checkSharedKeyUse(opts);
	if (denial) throw error(denial.status, denial.message);
}
