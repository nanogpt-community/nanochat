import { redirectToLogin } from '#lib/backend/auth/redirect.js';
import { toPublicAuthSession } from '#lib/auth-session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const session = await locals.auth();

	if (!session) redirectToLogin(url);

	return {
		session: toPublicAuthSession(session),
	};
};
