
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserKey } from '$lib/db/queries';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    // Get user's key or fallback to global key
    let apiKey = await getUserKey(userId, 'nanogpt');
    if (!apiKey && process.env.NANOGPT_API_KEY) {
        apiKey = process.env.NANOGPT_API_KEY;
    }

    if (!apiKey) {
        throw error(400, 'No NanoGPT API key found');
    }

    try {
        const response = await fetch('https://nano-gpt.com/api/check-balance', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('NanoGPT Balance Error:', errorData);
            throw error(response.status, 'Failed to fetch balance');
        }

        const data = await response.json();
        return json(data);
    } catch (e) {
        console.error('Balance fetch failed:', e);
        throw error(500, 'Failed to fetch balance');
    }
};
