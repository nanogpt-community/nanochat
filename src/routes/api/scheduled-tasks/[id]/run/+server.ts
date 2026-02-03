import { json, type RequestEvent } from '@sveltejs/kit';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { runScheduledTaskNow } from '$lib/backend/scheduler';

export async function POST({ request, params }: RequestEvent) {
	const userId = await getAuthenticatedUserId(request);
	if (!params.id) {
		return json({ error: 'Scheduled task id is required' }, { status: 400 });
	}

	try {
		const result = await runScheduledTaskNow(params.id, userId);
		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to run scheduled task';
		return json({ error: message }, { status: 400 });
	}
}
