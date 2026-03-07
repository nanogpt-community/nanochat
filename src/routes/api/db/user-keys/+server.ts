import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllUserKeyStatuses,
	getUserKeyStatus,
	setUserKey,
	deleteUserKey,
} from '$lib/db/queries';
import { enableDefaultModelsOnKeyAdd } from '$lib/db/queries/user-enabled-models';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// GET - get user keys
export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await getAuthenticatedUserId(request);
	const provider = url.searchParams.get('provider');

	if (provider) {
		return json(await getUserKeyStatus(userId, provider));
	}

	return json(await getAllUserKeyStatuses(userId));
};

// POST - set user key
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json();
    const { provider, key } = body;

    if (!provider || !key) {
        return error(400, 'Missing provider or key');
    }

    const result = await setUserKey(userId, provider, key);

    // Enable default models when NanoGPT key is added
    if (provider === 'nanogpt') {
        await enableDefaultModelsOnKeyAdd(userId);
    }

    return json({
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
    return json({ ok: true });
};
