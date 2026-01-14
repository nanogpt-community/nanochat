import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const getApiKey = (request: Request): string | null => {
	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token.length > 0) {
			return token;
		}
	}

	return request.headers.get('x-api-key') || env.NANOGPT_API_KEY || null;
};

export const GET: RequestHandler = async ({ request, fetch, url }) => {
	const apiKey = getApiKey(request);

	if (!apiKey) {
		return json({ error: 'API key is required' }, { status: 401 });
	}

	const runId = url.searchParams.get('runId');
	const model = url.searchParams.get('model');

	if (!runId || !model) {
		return json({ error: 'runId and model are required' }, { status: 400 });
	}

	const proxyUrl = new URL('https://nano-gpt.com/api/tts/status');
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
