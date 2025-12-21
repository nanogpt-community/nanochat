import { redirectToAuthorized } from '$lib/backend/auth/redirect';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const session = await locals.auth();

	if (session) redirectToAuthorized(url);

	return {
		signupsDisabled: env.DISABLE_SIGNUPS === 'true'
	};
}
