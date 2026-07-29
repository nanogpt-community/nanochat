import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createMessageRating,
	getMessageRatingsForConversation,
} from '$lib/db/queries/message-ratings';
import { getOwnedMessage } from '$lib/db/queries/messages';
import { getConversationById } from '$lib/db/queries/conversations';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await getAuthenticatedUserId(request);
	const conversationId = url.searchParams.get('conversationId');

	if (!conversationId) {
		throw error(400, 'conversationId is required');
	}

	// Ownership check, so ratings cannot be enumerated for someone else's chat.
	// getConversationById throws for a conversation the user cannot see, so the
	// lookup is guarded — otherwise that surfaces as a 500 rather than a 404.
	const conversation = await getConversationById(conversationId, userId).catch(() => null);
	if (!conversation || conversation.userId !== userId) {
		throw error(404, 'Conversation not found');
	}

	return json(await getMessageRatingsForConversation(userId, conversationId));
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const userId = await getAuthenticatedUserId(request);
		const body = await request.json();
		const { messageId, thumbs, rating, categories, feedback } = body;

		if (!messageId) {
			console.warn('[message-ratings] Missing messageId in request');
			throw error(400, 'messageId is required');
		}

		// Must be a message in one of the caller's own conversations. Existence alone
		// was enough before, and public shares hand out message ids, so anyone could
		// attach ratings to a stranger's messages.
		const message = await getOwnedMessage(messageId, userId);
		if (!message) {
			console.warn(`[message-ratings] Message not found or not owned: ${messageId}`);
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
