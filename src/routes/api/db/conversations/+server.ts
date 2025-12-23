import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import {
    getUserConversations,
    getConversationById,
    getPublicConversationById,
    createConversation,
    createConversationWithMessage,
    createBranchedConversation,
    updateConversationTitle,
    updateConversationGenerating,
    updateConversationCost,
    setConversationPublic,
    toggleConversationPin,
    deleteConversation,
    deleteAllConversations,
    searchConversations,
} from '$lib/db/queries';

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

// GET - list all conversations or get by id
export const GET: RequestHandler = async ({ request, url }) => {
    const conversationId = url.searchParams.get('id');
    const searchTerm = url.searchParams.get('search');
    const searchMode = url.searchParams.get('mode') as 'exact' | 'words' | 'fuzzy' | null;

    // Try to get session, but don't fail if not logged in
    let userId: string | undefined;
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        userId = session?.user?.id;
    } catch {
        // ignore
    }

    if (searchTerm) {
        if (!userId) throw error(401, 'Unauthorized');
        const results = await searchConversations(userId, searchTerm, searchMode ?? 'fuzzy');
        return json(results);
    }

    if (conversationId) {
        // If authenticated, try to get as user (handling own + public)
        if (userId) {
            try {
                const conversation = await getConversationById(conversationId, userId);
                if (conversation) return json(conversation);
            } catch (e) {
                // Ignore unauthorized error, try public fetch next
            }
        }

        // If not authenticated or above failed/unauthorized, try strictly public fetch
        const publicConversation = await getPublicConversationById(conversationId);
        if (publicConversation) {
            return json(publicConversation);
        }

        // If we get here, it's neither accessible by user nor public
        // Return 404 to avoid leaking existence of private conversations
        throw error(404, 'Conversation not found');
    }

    // Default: List user conversations (requires auth)
    if (!userId) throw error(401, 'Unauthorized');
    const conversations = await getUserConversations(userId);
    return json(conversations);
};

// POST - create or update conversation
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getSessionUserId(request);
    const body = await request.json();
    const { action } = body;

    switch (action) {
        case 'create': {
            const conversation = await createConversation(userId, body.title);
            return json(conversation);
        }

        case 'createWithMessage': {
            const result = await createConversationWithMessage(userId, {
                content: body.content,
                contentHtml: body.contentHtml,
                role: body.role,
                images: body.images,
                webSearchEnabled: body.webSearchEnabled,
            });
            return json(result);
        }

        case 'branch': {
            const newConversationId = await createBranchedConversation(
                userId,
                body.conversationId,
                body.fromMessageId
            );
            return json({ conversationId: newConversationId });
        }

        case 'updateTitle': {
            await updateConversationTitle(body.conversationId, userId, body.title);
            return json({ ok: true });
        }

        case 'updateGenerating': {
            await updateConversationGenerating(body.conversationId, userId, body.generating);
            return json({ ok: true });
        }

        case 'updateCost': {
            await updateConversationCost(body.conversationId, userId, body.costUsd);
            return json({ ok: true });
        }

        case 'setPublic': {
            await setConversationPublic(body.conversationId, userId, body.public);
            return json({ ok: true });
        }

        case 'togglePin': {
            const pinned = await toggleConversationPin(body.conversationId, userId);
            return json({ pinned });
        }

        default:
            return error(400, 'Invalid action');
    }
};

// DELETE - delete conversation or all conversations
export const DELETE: RequestHandler = async ({ request, url }) => {
    const userId = await getSessionUserId(request);
    const conversationId = url.searchParams.get('id');
    const deleteAll = url.searchParams.get('all');

    if (deleteAll === 'true') {
        await deleteAllConversations(userId);
        return json({ ok: true });
    }

    if (!conversationId) {
        return error(400, 'Missing conversation id');
    }

    await deleteConversation(conversationId, userId);
    return json({ ok: true });
};
