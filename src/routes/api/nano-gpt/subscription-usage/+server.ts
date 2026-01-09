
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserKey } from '$lib/db/queries';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export const GET: RequestHandler = async ({ request }) => {
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
        const response = await fetch('https://nano-gpt.com/api/subscription/v1/usage', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('NanoGPT Usage Error:', errorData);
            throw error(response.status, 'Failed to fetch usage');
        }

        const data = await response.json();
        return json(data);
    } catch (e) {
        console.error('Usage fetch failed:', e);
        throw error(500, 'Failed to fetch usage');
    }
};
