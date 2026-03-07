import { redirectToLogin } from '$lib/backend/auth/redirect';
import { toPublicAuthSession } from '$lib/auth-session';

export async function load({ locals, url }) {
	const session = await locals.auth();

	if (!session) redirectToLogin(url);

	return {
		session: toPublicAuthSession(session),
	};
}
