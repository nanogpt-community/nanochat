import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserSettings } from '$lib/db/queries/user-settings';
import { getConversationById } from '$lib/db/queries/conversations';
import { getMessagesByConversation } from '$lib/db/queries/messages';
import { saveToKarakeep } from '$lib/backend/karakeep';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json();
    const { conversationId } = body;

    if (!conversationId) {
        throw error(400, 'conversationId is required');
    }

    // Get user settings to retrieve Karakeep configuration
    const settings = await getUserSettings(userId);

    if (!settings?.karakeepUrl || !settings?.karakeepApiKey) {
        throw error(400, 'Karakeep is not configured. Please configure it in account settings.');
    }

    // Get conversation
    const conversation = await getConversationById(conversationId, userId);

    if (!conversation) {
        throw error(404, 'Conversation not found');
    }

    // Verify user owns the conversation
    if (conversation.userId !== userId) {
        throw error(403, 'You do not have permission to access this conversation');
    }

    // Get messages
    const messages = await getMessagesByConversation(conversationId);

    // Generate source URL if available
    const sourceUrl = typeof window !== 'undefined'
        ? `${new URL(request.url).origin}/chat/${conversationId}`
        : undefined;

    // Save to Karakeep
    const result = await saveToKarakeep(
        conversation,
        messages,
        settings.karakeepUrl,
        settings.karakeepApiKey,
        sourceUrl
    );

    if (!result.success) {
        throw error(500, result.error || 'Failed to save to Karakeep');
    }

    return json({
        success: true,
        bookmarkId: result.bookmarkId,
        message: 'Chat saved to Karakeep successfully',
    });
};
