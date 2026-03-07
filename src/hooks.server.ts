import { building } from '$app/environment';
import { auth } from '$lib/auth';
import { migrateEmailDomains } from '$lib/migrations/email-domain';
import { startScheduler } from '$lib/backend/scheduler';
import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handle: Handle = async ({ event, resolve }) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event.locals.auth = () => auth.api.getSession({ headers: event.request.headers }) as any;

	const response = await svelteKitHandler({ event, resolve, auth, building });

	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"base-uri 'self'",
			"frame-ancestors 'none'",
			"object-src 'none'",
			"script-src 'self' 'unsafe-eval'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' https: data: blob:",
			"font-src 'self' data:",
			"media-src 'self' https: blob:",
			"connect-src 'self' https: ws: wss:",
			"frame-src 'self'",
			"form-action 'self'",
		].join('; ')
	);
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Content-Type-Options', 'nosniff');

	return response;
};

if (!building) {
	// try {
	// 	// Run migrations on startup
	// 	// migrate(db, { migrationsFolder: 'drizzle' });
	// } catch (e) {
	// 	console.warn('Migration failed (database might be already up to date):', e);
	// }

	migrateEmailDomains();
	startScheduler();
}
