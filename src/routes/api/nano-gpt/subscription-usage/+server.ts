import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserKey } from '#lib/db/queries/index.js';
import { getAuthenticatedUserId } from '#lib/backend/auth-utils.js';
import { nanoGptUrl } from '#lib/backend/nano-gpt-url.server.js';
import { jsonNoStore } from '#lib/backend/http-security.js';
import { redactSecrets } from '#lib/backend/secret-redaction.js';

export const GET: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);

	const apiKey = await getUserKey(userId, 'nanogpt');
	if (!apiKey) {
		throw error(400, 'A user-owned NanoGPT API key is required for this endpoint');
	}

	try {
		const response = await fetch(nanoGptUrl('/api/subscription/v1/usage'), {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			const errorData = await response.text().catch(() => '');
			console.error('NanoGPT Usage Error:', redactSecrets(errorData));
			throw error(response.status, 'Failed to fetch usage');
		}

		const data = await response.json();
		return jsonNoStore(data);
	} catch (e) {
		console.error(
			'Usage fetch failed:',
			e instanceof Error ? redactSecrets(e.message) : 'unknown error'
		);
		throw error(500, 'Failed to fetch usage');
	}
};
