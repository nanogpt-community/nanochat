import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getStarredMessages } from '$lib/db/queries';

// GET - get all starred messages for current user
export const GET: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);
    const messages = await getStarredMessages(userId);
    return json(messages);
};
