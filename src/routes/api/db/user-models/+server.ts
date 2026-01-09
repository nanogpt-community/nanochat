import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getEnabledModels,
    getEnabledModel,
    setModelEnabled,
    toggleModelPinned,
    enableInitialModels,
} from '$lib/db/queries';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// GET - get enabled models
export const GET: RequestHandler = async ({ request, url }) => {
    const userId = await getAuthenticatedUserId(request);
    const provider = url.searchParams.get('provider');
    const modelId = url.searchParams.get('modelId');

    if (provider && modelId) {
        const model = await getEnabledModel(userId, provider, modelId);
        return json(model);
    }

    const models = await getEnabledModels(userId);
    return json(models);
};

// POST - set enabled model or toggle pin
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json();
    const { action } = body;

    switch (action) {
        case 'set': {
            await setModelEnabled(userId, body.provider, body.modelId, body.enabled);
            return json({ ok: true });
        }

        case 'togglePinned': {
            const pinned = await toggleModelPinned(userId, body.modelId);
            return json({ pinned });
        }

        case 'enableInitial': {
            await enableInitialModels(userId);
            return json({ ok: true });
        }

        default:
            return error(400, 'Invalid action');
    }
};
