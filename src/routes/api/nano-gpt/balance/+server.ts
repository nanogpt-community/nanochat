import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserKey } from '#lib/db/queries/index.js';
import { getAuthenticatedUserId } from '#lib/backend/auth-utils.js';
import { nanoGptUrl } from '#lib/backend/nano-gpt-url.server.js';
import { jsonNoStore } from '#lib/backend/http-security.js';
import { redactSecrets } from '#lib/backend/secret-redaction.js';

export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);

	const apiKey = await getUserKey(userId, 'nanogpt');
	if (!apiKey) {
		throw error(400, 'A user-owned NanoGPT API key is required for this endpoint');
	}

	try {
		const response = await fetch(nanoGptUrl('/api/check-balance'), {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
			},
		});

		if (!response.ok) {
			const errorData = await response.text().catch(() => '');
			console.error('NanoGPT Balance Error:', redactSecrets(errorData));
			throw error(response.status, 'Failed to fetch balance');
		}

		const data = await response.json();
		return jsonNoStore(data);
	} catch (e) {
		console.error(
			'Balance fetch failed:',
			e instanceof Error ? redactSecrets(e.message) : 'unknown error'
		);
		throw error(500, 'Failed to fetch balance');
	}
};
