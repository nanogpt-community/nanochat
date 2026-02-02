import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getUserKey } from '$lib/db/queries';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';

const getExplicitNanoGPTKey = (request: Request): string | null => {
	const headerKey = request.headers.get('x-api-key');
	if (headerKey && !headerKey.startsWith('nc_')) {
		return headerKey;
	}

	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token.length > 0 && !token.startsWith('nc_')) {
			return token;
		}
	}

	return null;
};

const resolveNanoGPTKey = async (request: Request, userId?: string): Promise<string | null> => {
	const explicitKey = getExplicitNanoGPTKey(request);
	if (explicitKey) return explicitKey;

	if (!userId) return null;

	const userKey = await getUserKey(userId, 'nanogpt');
	return userKey || env.NANOGPT_API_KEY || null;
};

export const GET: RequestHandler = async ({ request, fetch, url }) => {
	const userId = await tryGetAuthenticatedUserId(request);
	const apiKey = await resolveNanoGPTKey(request, userId);

	if (!apiKey) {
		return json({ error: 'Authentication required or NanoGPT API key missing' }, { status: 401 });
	}

	const runId = url.searchParams.get('runId');
	const model = url.searchParams.get('model');

	if (!runId || !model) {
		return json({ error: 'runId and model are required' }, { status: 400 });
	}

	const proxyUrl = new URL(nanoGptUrl('/api/tts/status'));
	for (const [key, value] of url.searchParams.entries()) {
		proxyUrl.searchParams.set(key, value);
	}

	const response = await fetch(proxyUrl.toString(), {
		headers: {
			'x-api-key': apiKey,
		},
	});

	const contentType = response.headers.get('Content-Type') || '';
	if (contentType.includes('application/json')) {
		const data = await response.json();
		return json(data, { status: response.status });
	}

	const text = await response.text();
	return new Response(text, {
		status: response.status,
		headers: {
			'Content-Type': contentType,
		},
	});
};
