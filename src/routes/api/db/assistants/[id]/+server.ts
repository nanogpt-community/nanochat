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
    const userId = await getSessionUserId(request);
    const assistant = await getAssistantById(userId, params.id);
    if (!assistant) {
        throw error(404, 'Assistant not found');
    }
    return json(assistant);
}

export const PUT: RequestHandler = async ({ request, params }) => {
    const userId = await getSessionUserId(request);
    const body = await request.json();

    const assistant = await updateAssistant(userId, params.id, {
        name: body.name,
        description: body.description,
        modelId: body.modelId,
        provider: body.provider,
        systemPrompt: body.systemPrompt,
    });
    return json(assistant);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
    const userId = await getSessionUserId(request);
    await deleteAssistant(userId, params.id);
    return json({ ok: true });
};
