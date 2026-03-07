import { building } from '$app/environment';
import { auth } from '$lib/auth';
import { migrateEmailDomains } from '$lib/migrations/email-domain';
import { startScheduler } from '$lib/backend/scheduler';
import { appendSensitiveVary, applyNoStoreHeaders } from '$lib/backend/http-security';
import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

function requestCarriesSensitiveAuth(event: Parameters<Handle>[0]['event']): boolean {
	return Boolean(
		event.request.headers.get('authorization') ||
		event.request.headers.get('cookie') ||
		event.request.headers.get('x-api-key')
	);
}

function responseShouldDisableCaching(pathname: string, contentType: string): boolean {
	return (
		pathname.startsWith('/api/') ||
		contentType.includes('application/json') ||
		contentType.includes('text/html') ||
		contentType.includes('text/event-stream')
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event.locals.auth = () => auth.api.getSession({ headers: event.request.headers }) as any;

	const response = await svelteKitHandler({ event, resolve, auth, building });
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Content-Type-Options', 'nosniff');

	if (requestCarriesSensitiveAuth(event)) {
		const contentType = response.headers.get('content-type') ?? '';

		if (responseShouldDisableCaching(event.url.pathname, contentType)) {
			appendSensitiveVary(response.headers);

			if (!response.headers.has('Cache-Control')) {
				applyNoStoreHeaders(response.headers);
			}
		}
	}

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
