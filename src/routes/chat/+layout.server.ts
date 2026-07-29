import { redirectToLogin } from '$lib/backend/auth/redirect';
import { toPublicAuthSession } from '$lib/auth-session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const session = await locals.auth();

	if (!session) redirectToLogin(url);

	return {
		session: toPublicAuthSession(session),
	};
};
