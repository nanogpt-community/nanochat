import { redirectToAuthorized } from '#lib/backend/auth/redirect.js';

import {
	DISABLE_SIGNUPS,
	SSO_PROVIDER_ID,
	SSO_DOMAIN,
	SSO_OIDC_ISSUER,
	SSO_OIDC_CLIENT_ID,
	SSO_OIDC_CLIENT_SECRET,
	SSO_LABEL,
} from '$app/env/private';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const session = await locals.auth();

	if (session) redirectToAuthorized(url);

	return {
		signupsDisabled: DISABLE_SIGNUPS === 'true',
		ssoEnabled: Boolean(
			SSO_PROVIDER_ID &&
			SSO_DOMAIN &&
			SSO_OIDC_ISSUER &&
			SSO_OIDC_CLIENT_ID &&
			SSO_OIDC_CLIENT_SECRET
		),
		ssoProviderId: SSO_PROVIDER_ID,
		ssoDomain: SSO_DOMAIN,
		ssoLabel: SSO_LABEL || 'Single sign-on',
	};
};
