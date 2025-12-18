import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import {
    getUserConversations,
    getConversationById,
    createConversation,
    createConversationWithMessage,
    createBranchedConversation,
    updateConversationTitle,
    updateConversationGenerating,
    updateConversationCost,
    setConversationPublic,
    toggleConversationPin,
    deleteConversation,
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
    const userId = await getSessionUserId(request);
    const conversationId = url.searchParams.get('id');
    const searchTerm = url.searchParams.get('search');
    const searchMode = url.searchParams.get('mode') as 'exact' | 'words' | 'fuzzy' | null;

    if (searchTerm) {
        const results = await searchConversations(userId, searchTerm, searchMode ?? 'fuzzy');
        return json(results);
    }

    if (conversationId) {
        const conversation = await getConversationById(conversationId, userId);
        return json(conversation);
    }

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

// DELETE - delete conversation
export const DELETE: RequestHandler = async ({ request, url }) => {
    const userId = await getSessionUserId(request);
    const conversationId = url.searchParams.get('id');

    if (!conversationId) {
        return error(400, 'Missing conversation id');
    }

    await deleteConversation(conversationId, userId);
    return json({ ok: true });
};
