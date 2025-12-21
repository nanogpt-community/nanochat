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
	try {
		console.log('[GET /api/db/assistants] Starting request');
		const userId = await getSessionUserId(request);
		console.log('[GET /api/db/assistants] User ID:', userId);
		
		const assistants = await getAllAssistants(userId);
		console.log('[GET /api/db/assistants] Assistants found:', assistants.length);
		
		return json(assistants);
	} catch (e) {
		console.error('[GET /api/db/assistants] Error:', e);
		if (e && typeof e === 'object' && 'status' in e) {
			throw e; // Re-throw HTTP errors
		}
		throw error(500, 'Internal Server Error');
	}
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        console.log('[POST /api/db/assistants] Starting request');
        const userId = await getSessionUserId(request);
        console.log('[POST /api/db/assistants] User ID:', userId);
        
        const body = await request.json();
        console.log('[POST /api/db/assistants] Request body:', body);

        // Validate required fields
        if (!body.name || !body.modelId || !body.provider || !body.systemPrompt) {
            console.error('[POST /api/db/assistants] Missing required fields:', {
                name: !!body.name,
                modelId: !!body.modelId,
                provider: !!body.provider,
                systemPrompt: !!body.systemPrompt,
            });
            throw error(400, 'Missing required fields: name, modelId, provider, and systemPrompt are required');
        }

        const assistant = await createAssistant(userId, {
            name: body.name,
            description: body.description || null,
            modelId: body.modelId,
            provider: body.provider,
            systemPrompt: body.systemPrompt,
        });
        console.log('[POST /api/db/assistants] Assistant created:', assistant);
        
        return json(assistant);
    } catch (e) {
        console.error('[POST /api/db/assistants] Error:', e);
        if (e && typeof e === 'object' && 'status' in e) {
            throw e; // Re-throw HTTP errors
        }
        throw error(500, 'Internal Server Error');
    }
};
