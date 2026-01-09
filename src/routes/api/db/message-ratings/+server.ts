import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createMessageRating } from '$lib/db/queries/message-ratings';
import { getMessageById } from '$lib/db/queries/messages';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const userId = await getAuthenticatedUserId(request);
        const body = await request.json();
        const { messageId, thumbs, rating, categories, feedback } = body;

        if (!messageId) {
            console.warn('[message-ratings] Missing messageId in request');
            throw error(400, 'messageId is required');
        }

        // Verify message exists
        const message = await getMessageById(messageId);
        if (!message) {
            console.warn(`[message-ratings] Message not found: ${messageId}`);
            throw error(404, 'Message not found');
        }

        // Create or update rating
        const messageRating = await createMessageRating({
            messageId,
            userId,
            thumbs,
            rating,
            categories,
            feedback,
        });

        console.log(`[message-ratings] Rating saved for message ${messageId} by user ${userId}`);
        return json({ success: true, rating: messageRating });
    } catch (err) {
        console.error('[message-ratings] Error saving rating:', err);
        if (err && typeof err === 'object' && 'status' in err) {
            throw err; // Re-throw SvelteKit errors
        }
        throw error(500, 'Failed to save rating');
    }
};
