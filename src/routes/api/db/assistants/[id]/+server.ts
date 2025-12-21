import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import { updateAssistant, deleteAssistant, getAssistantById } from '$lib/db/queries';

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

export const GET: RequestHandler = async ({ request, params }) => {
    try {
        console.log('[GET /api/db/assistants/[id]] Starting request for:', params.id);
        const userId = await getSessionUserId(request);
        const assistant = await getAssistantById(userId, params.id);
        if (!assistant) {
            throw error(404, 'Assistant not found');
        }
        console.log('[GET /api/db/assistants/[id]] Assistant found:', assistant.id);
        return json(assistant);
    } catch (e) {
        console.error('[GET /api/db/assistants/[id]] Error:', e);
        if (e && typeof e === 'object' && 'status' in e) {
            throw e;
        }
        throw error(500, 'Internal Server Error');
    }
}

export const PUT: RequestHandler = async ({ request, params }) => {
    try {
        console.log('[PUT /api/db/assistants/[id]] Starting request for:', params.id);
        const userId = await getSessionUserId(request);
        const body = await request.json();
        console.log('[PUT /api/db/assistants/[id]] Request body:', body);

        const assistant = await updateAssistant(userId, params.id, {
            name: body.name,
            description: body.description,
            modelId: body.modelId,
            provider: body.provider,
            systemPrompt: body.systemPrompt,
        });
        console.log('[PUT /api/db/assistants/[id]] Assistant updated:', assistant.id);
        return json(assistant);
    } catch (e) {
        console.error('[PUT /api/db/assistants/[id]] Error:', e);
        if (e && typeof e === 'object' && 'status' in e) {
            throw e;
        }
        throw error(500, 'Internal Server Error');
    }
};

export const DELETE: RequestHandler = async ({ request, params }) => {
    try {
        console.log('[DELETE /api/db/assistants/[id]] Starting request for:', params.id);
        const userId = await getSessionUserId(request);
        await deleteAssistant(userId, params.id);
        console.log('[DELETE /api/db/assistants/[id]] Assistant deleted:', params.id);
        return json({ ok: true });
    } catch (e) {
        console.error('[DELETE /api/db/assistants/[id]] Error:', e);
        if (e && typeof e === 'object' && 'status' in e) {
            throw e;
        }
        throw error(500, 'Internal Server Error');
    }
};
