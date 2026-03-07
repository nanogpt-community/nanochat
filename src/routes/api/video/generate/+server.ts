import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getUserKey } from '$lib/db/queries';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { readRedactedResponseText, redactSecrets } from '$lib/backend/secret-redaction';

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

export const POST: RequestHandler = async ({ request, fetch }) => {
    try {
        const body = await request.json();
        const userId = await tryGetAuthenticatedUserId(request);
        const apiKey = await resolveNanoGPTKey(request, userId);

        if (!apiKey) {
            return json({ error: 'Authentication required or NanoGPT API key missing' }, { status: 401 });
        }

        const response = await fetch(nanoGptUrl('/api/generate-video'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await readRedactedResponseText(response);
            return json({ error: `NanoGPT API Error: ${errText || response.statusText}` }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error(
            '[Video Generate] Server Error:',
            error instanceof Error ? redactSecrets(error.message) : 'unknown error'
        );
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
