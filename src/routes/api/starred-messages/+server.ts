import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import { getStarredMessages } from '$lib/db/queries';

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

// GET - get all starred messages for current user
export const GET: RequestHandler = async ({ request }) => {
    const userId = await getSessionUserId(request);
    const messages = await getStarredMessages(userId);
    return json(messages);
};
