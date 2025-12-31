import { auth } from '$lib/auth';
import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handle: Handle = async ({ event, resolve }) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event.locals.auth = () => auth.api.getSession({ headers: event.request.headers }) as any;

	return svelteKitHandler({ event, resolve, auth, building });
};

import { building } from '$app/environment';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db } from '$lib/db';

if (!building) {
	// try {
	// 	// Run migrations on startup
	// 	migrate(db, { migrationsFolder: 'drizzle' });
	// } catch (e) {
	// 	console.warn('Migration failed (database might be already up to date):', e);
	// }
}
