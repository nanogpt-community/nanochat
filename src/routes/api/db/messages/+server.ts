import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import {
    getConversationMessages,
    getPublicConversationMessages,
    createMessage,
    updateMessageContent,
    updateMessage,
    updateMessageError,
    deleteMessage,
    setMessageStarred,
} from '$lib/db/queries';
import { getConversationById } from '$lib/db/queries/conversations';

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

// GET - get messages for a conversation
export const GET: RequestHandler = async ({ request, url }) => {
    const conversationId = url.searchParams.get('conversationId');
    const isPublic = url.searchParams.get('public') === 'true';

    if (!conversationId) {
        return error(400, 'Missing conversationId');
    }

    if (isPublic) {
        const messages = await getPublicConversationMessages(conversationId);
        if (!messages) {
            return error(404, 'Conversation not found or not public');
        }
        return json(messages);
    }

    const userId = await getSessionUserId(request);
    const messages = await getConversationMessages(conversationId, userId);
    return json(messages);
};

// POST - create or update message
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getSessionUserId(request);
    const body = await request.json();
    const { action } = body;

    switch (action) {
        case 'create': {
            // Verify user owns the conversation
            const conversation = await getConversationById(body.conversationId, userId);
            if (!conversation || conversation.userId !== userId) {
                return error(403, 'Unauthorized');
            }

            const message = await createMessage(body.conversationId, {
                role: body.role,
                content: body.content,
                contentHtml: body.contentHtml,
                modelId: body.modelId,
                provider: body.provider,
                tokenCount: body.tokenCount,
                images: body.images,
                webSearchEnabled: body.webSearchEnabled,
                reasoningEffort: body.reasoningEffort,
            });
            return json(message);
        }

        case 'updateContent': {
            await updateMessageContent(body.messageId, {
                content: body.content,
                contentHtml: body.contentHtml,
                reasoning: body.reasoning,
                generationId: body.generationId,
                reasoningEffort: body.reasoningEffort,
                annotations: body.annotations,
            });
            return json({ ok: true });
        }

        case 'update': {
            await updateMessage(body.messageId, {
                tokenCount: body.tokenCount,
                costUsd: body.costUsd,
                generationId: body.generationId,
                contentHtml: body.contentHtml,
            });
            return json({ ok: true });
        }

        case 'updateError': {
            await updateMessageError(body.messageId, body.conversationId, body.error);
            return json({ ok: true });
        }

        case 'delete': {
            await deleteMessage(body.messageId);
            return json({ ok: true });
        }

        case 'setStarred': {
            await setMessageStarred(body.messageId, body.starred);
            return json({ ok: true });
        }

        default:
            return error(400, 'Invalid action');
    }
};
