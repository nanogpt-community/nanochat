import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllUserKeys, getUserKey, setUserKey, deleteUserKey } from '$lib/db/queries';
import { enableDefaultModelsOnKeyAdd } from '$lib/db/queries/user-enabled-models';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// GET - get user keys
export const GET: RequestHandler = async ({ request, url }) => {
    const userId = await getAuthenticatedUserId(request);
    const provider = url.searchParams.get('provider');

    if (provider) {
        const key = await getUserKey(userId, provider);

        // Return masked global key if no user key but env var exists
        if (!key && provider === 'nanogpt' && process.env.NANOGPT_API_KEY) {
            return json('sk-antigravity...global');
        }

        return json(key);
    }

    const allKeys = await getAllUserKeys(userId);
    return json(allKeys);
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

    return json(result);
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
