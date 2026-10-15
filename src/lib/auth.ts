import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import { sso } from '@better-auth/sso';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import 'dotenv/config';

import {
	SSO_PROVIDER_ID,
	SSO_DOMAIN,
	SSO_OIDC_ISSUER,
	SSO_OIDC_CLIENT_ID,
	SSO_OIDC_CLIENT_SECRET,
	BETTER_AUTH_SECRET,
	BETTER_AUTH_TRUSTED_ORIGINS,
	BETTER_AUTH_URL,
	DISABLE_SIGNUPS,
} from '$app/env/private';

import { db } from './db';
import * as schema from './db/schema';
import { createUserSettings } from './db/queries';

const ssoProvider =
	SSO_PROVIDER_ID && SSO_DOMAIN && SSO_OIDC_ISSUER && SSO_OIDC_CLIENT_ID && SSO_OIDC_CLIENT_SECRET
		? {
				providerId: SSO_PROVIDER_ID,
				domain: SSO_DOMAIN,
				oidcConfig: {
					issuer: SSO_OIDC_ISSUER,
					clientId: SSO_OIDC_CLIENT_ID,
					clientSecret: SSO_OIDC_CLIENT_SECRET,
					discoveryEndpoint: `${SSO_OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`,
					scopes: ['openid', 'email', 'profile'],
					pkce: true,
				},
			}
		: undefined;

export const auth = betterAuth({
	secret: BETTER_AUTH_SECRET!,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
			passkey: schema.passkey,
			ssoProvider: schema.ssoProvider,
		},
	}),
	trustedOrigins: BETTER_AUTH_TRUSTED_ORIGINS ? BETTER_AUTH_TRUSTED_ORIGINS.split(',') : [],
	plugins: [
		passkey({
			rpID: new URL(BETTER_AUTH_URL || 'http://localhost:3000').hostname,
			origin: [
				BETTER_AUTH_URL || 'http://localhost:3000',
				(BETTER_AUTH_URL || 'http://localhost:3000').replace(/:\d+$/, ''),
				...(BETTER_AUTH_TRUSTED_ORIGINS ? BETTER_AUTH_TRUSTED_ORIGINS.split(',') : []),
			],
			rpName: 'nano.chat',
		}),
		sso({
			defaultSSO: ssoProvider ? [ssoProvider] : [],
			providersLimit: 0,
		}),
	],
	emailAndPassword: { enabled: true, disableSignUp: DISABLE_SIGNUPS === 'true' },
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Create user settings when a new user signs up
					await createUserSettings(user.id);
				},
			},
		},
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache duration in seconds
		},
	},
});
