import { json } from '@sveltejs/kit';

const NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0';
const SENSITIVE_RESPONSE_VARY = 'Authorization, Cookie, x-api-key';

function mergeVary(existing: string | null, value: string): string {
	if (!existing) {
		return value;
	}

	const parts = new Set(
		existing
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)
	);

	for (const part of value.split(',')) {
		const trimmed = part.trim();
		if (trimmed) {
			parts.add(trimmed);
		}
	}

	return Array.from(parts).join(', ');
}

export function applyNoStoreHeaders(
	headers: Headers,
	vary: string = SENSITIVE_RESPONSE_VARY
): Headers {
	headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
	headers.set('Pragma', 'no-cache');
	headers.set('Vary', mergeVary(headers.get('Vary'), vary));
	return headers;
}

export function appendSensitiveVary(
	headers: Headers,
	vary: string = SENSITIVE_RESPONSE_VARY
): Headers {
	headers.set('Vary', mergeVary(headers.get('Vary'), vary));
	return headers;
}

export function withNoStoreHeaders(init: ResponseInit = {}): ResponseInit {
	const headers = applyNoStoreHeaders(new Headers(init.headers));

	return {
		...init,
		headers,
	};
}

export function jsonNoStore(data: unknown, init?: ResponseInit): Response {
	return json(data, withNoStoreHeaders(init));
}
