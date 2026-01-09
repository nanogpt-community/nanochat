import { json, error, type RequestEvent } from '@sveltejs/kit';
import { deleteTemporaryConversations } from '$lib/db/queries';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// POST - cleanup temporary conversations from previous sessions
export async function POST({ request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    try {
        await deleteTemporaryConversations(userId);
        return json({ ok: true });
    } catch (e) {
        console.error('Failed to cleanup temporary conversations:', e);
        return json({ ok: false, error: String(e) });
    }
};
