import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import {
    getEnabledModels,
    getEnabledModel,
    setModelEnabled,
    toggleModelPinned,
    enableInitialModels,
} from '$lib/db/queries';

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

// GET - get enabled models
export const GET: RequestHandler = async ({ request, url }) => {
    const userId = await getSessionUserId(request);
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
    const userId = await getSessionUserId(request);
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
