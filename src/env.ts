import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DISABLE_SIGNUPS: { schema: (input) => input },
	SSO_PROVIDER_ID: { schema: (input) => input },
	SSO_DOMAIN: { schema: (input) => input },
	SSO_OIDC_ISSUER: { schema: (input) => input },
	SSO_OIDC_CLIENT_ID: { schema: (input) => input },
	SSO_OIDC_CLIENT_SECRET: { schema: (input) => input },
	SSO_LABEL: { schema: (input) => input },
	NANOGPT_API_KEY: { schema: (input) => input },
	BETTER_AUTH_SECRET: { schema: (input) => input },
	BETTER_AUTH_TRUSTED_ORIGINS: { schema: (input) => input },
	BETTER_AUTH_URL: { schema: (input) => input },
	NANOGPT_BASE_URL: { schema: (input) => input },
});
