import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import { getAllAssistants, createAssistant } from '$lib/db/queries';

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

export const GET: RequestHandler = async ({ request }) => {
    const userId = await getSessionUserId(request);
    const assistants = await getAllAssistants(userId);
    return json(assistants);
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        console.log('[POST /api/db/assistants] Starting request');
        const userId = await getSessionUserId(request);
        console.log('[POST /api/db/assistants] User ID:', userId);
        
        const body = await request.json();
        console.log('[POST /api/db/assistants] Request body:', body);

        const assistant = await createAssistant(userId, {
            name: body.name,
            description: body.description,
            modelId: body.modelId,
            provider: body.provider,
            systemPrompt: body.systemPrompt,
        });
        console.log('[POST /api/db/assistants] Assistant created:', assistant);
        
        return json(assistant);
    } catch (e) {
        console.error('[POST /api/db/assistants] Error:', e);
        throw error(500, 'Internal Server Error');
    }
};
