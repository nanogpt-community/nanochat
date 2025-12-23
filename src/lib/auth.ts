import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import 'dotenv/config';
import { env } from '$env/dynamic/private';
import { db } from './db';
import * as schema from './db/schema';
import { createUserSettings } from './db/queries';

export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET!,
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
			passkey: schema.passkey,
		},
	}),
	trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',') : [],
	plugins: [
		passkey({
			rpID: new URL(env.BETTER_AUTH_URL || 'http://localhost:3000').hostname,
			origin: [
				env.BETTER_AUTH_URL || 'http://localhost:3000',
				(env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/:\d+$/, ''),
				...(env.BETTER_AUTH_TRUSTED_ORIGINS ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',') : [])
			],
			rpName: 'thom.chat',
		})
	],
	emailAndPassword: {
		enabled: true,
		disableSignUp: env.DISABLE_SIGNUPS === 'true',
	},
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
