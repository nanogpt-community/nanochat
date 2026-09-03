import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { jsonNoStore } from '$lib/backend/http-security';
import {
	listUserMemories,
	createUserMemory,
	updateUserMemory,
	deleteUserMemory,
	deleteAllUserMemories,
	MAX_MEMORIES,
} from '$lib/db/queries/user-memories';

export const GET: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	return jsonNoStore(await listUserMemories(userId));
};

export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const body = await request.json();
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) return error(400, 'content is required');

	switch (body.action) {
		case 'create': {
			const existing = await listUserMemories(userId);
			if (existing.length >= MAX_MEMORIES)
				return error(400, `Memory limit of ${MAX_MEMORIES} reached`);
			return jsonNoStore(await createUserMemory(userId, content));
		}
		case 'update': {
			if (typeof body.id !== 'string') return error(400, 'id is required');
			const updated = await updateUserMemory(userId, body.id, content);
			if (!updated) return error(404, 'Memory not found');
			return jsonNoStore(updated);
		}
		default:
			return error(400, 'Invalid action');
	}
};

export const DELETE: RequestHandler = async ({ request, url }) => {
	const userId = await getAuthenticatedUserId(request);
	if (url.searchParams.get('all') === 'true') {
		await deleteAllUserMemories(userId);
		return jsonNoStore({ ok: true });
	}
	const id = url.searchParams.get('id');
	if (!id) return error(400, 'Missing memory id');
	await deleteUserMemory(userId, id);
	return jsonNoStore({ ok: true });
};
