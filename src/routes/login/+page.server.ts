import { redirectToAuthorized } from '$lib/backend/auth/redirect';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const session = await locals.auth();

	if (session) redirectToAuthorized(url);

	return {
		signupsDisabled: env.DISABLE_SIGNUPS === 'true',
		ssoEnabled: Boolean(
			env.SSO_PROVIDER_ID &&
			env.SSO_DOMAIN &&
			env.SSO_OIDC_ISSUER &&
			env.SSO_OIDC_CLIENT_ID &&
			env.SSO_OIDC_CLIENT_SECRET
		),
		ssoProviderId: env.SSO_PROVIDER_ID,
		ssoDomain: env.SSO_DOMAIN,
		ssoLabel: env.SSO_LABEL || 'Single sign-on',
	};
};
