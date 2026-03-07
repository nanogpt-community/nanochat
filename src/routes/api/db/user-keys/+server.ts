import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllUserKeyStatuses,
	getUserKeyStatus,
	setUserKey,
	deleteUserKey,
} from '$lib/db/queries';
import { enableDefaultModelsOnKeyAdd } from '$lib/db/queries/user-enabled-models';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { assertEncryptionEnabled } from '$lib/encryption';
import { jsonNoStore } from '$lib/backend/http-security';

// GET - get user keys
export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await getAuthenticatedUserId(request);
	const provider = url.searchParams.get('provider');

	if (provider) {
		return jsonNoStore(await getUserKeyStatus(userId, provider));
	}

	return jsonNoStore(await getAllUserKeyStatuses(userId));
};

// POST - set user key
export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const body = await request.json();
	const { provider, key } = body;

	if (!provider || !key) {
		return error(400, 'Missing provider or key');
	}

	try {
		assertEncryptionEnabled();
	} catch (e) {
		return error(503, e instanceof Error ? e.message : 'Secret storage is not configured');
	}

	const result = await setUserKey(userId, provider, key);

	// Enable default models when NanoGPT key is added
	if (provider === 'nanogpt') {
		await enableDefaultModelsOnKeyAdd(userId);
	}

	return jsonNoStore({
		ok: true,
		provider: result.provider,
		createdAt: result.createdAt,
		updatedAt: result.updatedAt,
	});
};

// DELETE - delete user key
export const DELETE: RequestHandler = async ({ request, url }) => {
	const userId = await getAuthenticatedUserId(request);
	const provider = url.searchParams.get('provider');

	if (!provider) {
		return error(400, 'Missing provider');
	}

	await deleteUserKey(userId, provider);
	return jsonNoStore({ ok: true });
};
