import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logMessageInteraction } from '$lib/db/queries/message-interactions';
import { getOwnedMessage } from '$lib/db/queries/messages';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const userId = await getAuthenticatedUserId(request);
		const body = await request.json();
		const { messageId, action, metadata } = body;

		if (!messageId) {
			console.warn('[message-interactions] Missing messageId in request');
			throw error(400, 'messageId is required');
		}

		if (!action || !['regenerate', 'edit', 'copy', 'share'].includes(action)) {
			console.warn(`[message-interactions] Invalid action: ${action}`);
			throw error(400, 'Valid action is required (regenerate, edit, copy, share)');
		}

		// Must belong to one of the caller's own conversations; existence alone let
		// anyone log interactions against a stranger's messages.
		const message = await getOwnedMessage(messageId, userId);
		if (!message) {
			console.warn(`[message-interactions] Message not found or not owned: ${messageId}`);
			throw error(404, 'Message not found');
		}

		// Log interaction
		const interaction = await logMessageInteraction({
			messageId,
			userId,
			action,
			metadata,
		});

		console.log(
			`[message-interactions] Logged ${action} for message ${messageId} by user ${userId}`
		);
		return json({ success: true, interaction });
	} catch (err) {
		console.error('[message-interactions] Error logging interaction:', err);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		throw error(500, 'Failed to log interaction');
	}
};
