import { redirect } from '@sveltejs/kit';

const PARAM_NAME = 'redirect_to';

/** Redirect back to login and add provided url to the redirect_to parameter
 *
 * @param url
 */
export function redirectToLogin(url: URL): never {
	const path = url.pathname;

	const location = `/login?${PARAM_NAME}=${path}`;

	redirect(303, location);
}

/** Redirect back to an authorized route either using the redirect_to parameter or the fallback if not provided
 *
 * @param url
 * @param fallback
 */
export function redirectToAuthorized(url: URL, fallback = '/account'): never {
	const to = getRedirectTo(url) ?? fallback;

	redirect(303, to);
}

/**
 * Only a same-site path is honoured. `//evil.example`, `/\\evil.example`, absolute
 * URLs and anything with a scheme would otherwise turn a login link into an open
 * redirect off a trusted domain.
 */
export function getRedirectTo(url: URL): string | null {
	const raw = url.searchParams.get(PARAM_NAME);
	if (!raw) return null;
	if (!/^\/(?![\/\\])/.test(raw)) return null;
	try {
		const resolved = new URL(raw, url.origin);
		if (resolved.origin !== url.origin) return null;
		return resolved.pathname + resolved.search + resolved.hash;
	} catch {
		return null;
	}
}
