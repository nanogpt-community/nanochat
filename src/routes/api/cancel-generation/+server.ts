import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { z } from 'zod/v4';
import { db } from '$lib/db';
import { conversations } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// Import the global cache from generate-message
import { generationAbortControllers } from '../generate-message/cache.js';

const reqBodySchema = z.object({
	conversation_id: z.string(),
	session_token: z.string().optional(),
});

export type CancelGenerationRequestBody = z.infer<typeof reqBodySchema>;

export type CancelGenerationResponse = {
	ok: true;
	cancelled: boolean;
};

function response(res: CancelGenerationResponse) {
	return json(res);
}

export const POST: RequestHandler = async ({ request }) => {
	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		return error(400, 'Failed to parse request body');
	}

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		return error(400, parsed.error);
	}
	const args = parsed.data;

	// Get user ID using dual auth
	const userId = await getAuthenticatedUserId(request);

	// Verify the user owns this conversation
	const conversation = await db.query.conversations.findFirst({
		where: and(
			eq(conversations.id, args.conversation_id),
			eq(conversations.userId, userId)
		),
	});

	if (!conversation) {
		return error(403, 'Conversation not found or unauthorized');
	}

	// Try to cancel the generation
	const abortController = generationAbortControllers.get(args.conversation_id);
	let cancelled = false;

	if (abortController) {
		abortController.abort();
		generationAbortControllers.delete(args.conversation_id);
		cancelled = true;

		// Update conversation generating status to false
		await db.update(conversations)
			.set({ generating: false })
			.where(eq(conversations.id, args.conversation_id));
	}

	return response({ ok: true, cancelled });
};
