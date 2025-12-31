import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import {
	getUserSettings,
	updateUserSettings,
	incrementFreeMessageCount,
	getOrCreateUserSettings,
} from '$lib/db/queries';

async function getSessionUserId(request: Request): Promise<string> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		throw error(401, 'Unauthorized');
	}
	return session.user.id;
}

// GET - get user settings
export const GET: RequestHandler = async ({ request }) => {
	const userId = await getSessionUserId(request);
	const settings = await getOrCreateUserSettings(userId);
	return json(settings);
};

// POST - update user settings
export const POST: RequestHandler = async ({ request }) => {
	const userId = await getSessionUserId(request);
	const body = await request.json();
	const { action } = body;

	switch (action) {
		case 'update': {
			const settings = await updateUserSettings(userId, {
				privacyMode: body.privacyMode,
				contextMemoryEnabled: body.contextMemoryEnabled,
				persistentMemoryEnabled: body.persistentMemoryEnabled,
				youtubeTranscriptsEnabled: body.youtubeTranscriptsEnabled,
				followUpQuestionsEnabled: body.followUpQuestionsEnabled,
				karakeepUrl: body.karakeepUrl,
				karakeepApiKey: body.karakeepApiKey,
				theme: body.theme,
				titleModelId: body.titleModelId,
				followUpModelId: body.followUpModelId,
			});
			return json(settings);
		}

		case 'incrementFreeMessages': {
			await incrementFreeMessageCount(userId);
			return json({ ok: true });
		}

		default:
			return error(400, 'Invalid action');
	}
};
