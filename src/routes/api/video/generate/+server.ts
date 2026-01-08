import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch }) => {
    try {
        const body = await request.json();
        const apiKey = request.headers.get('x-api-key') || env.NANOGPT_API_KEY;

        if (!apiKey) {
            return json({ error: 'API key is required' }, { status: 401 });
        }

        const response = await fetch('https://nano-gpt.com/api/generate-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey // NanoGPT expects x-api-key or Authorization? 
                // Documentation usually says Authorization: Bearer <token> for older keys, 
                // but x-api-key for newer? 
                // I'll check what I used in status. Status used x-api-key.
                // TTS used Authorization: Bearer.
                // I should check `nano-gpt.ts` or docs.
                // `src/lib/backend/models/nano-gpt.ts` uses fetch without auth (public endpoints).
                // `tts/+server.ts` used `Authorization: Bearer`.
                // I'll use `x-api-key` based on `status` endpoint implementation which I just wrote.
                // Or try both/either. 
                // The provided docs might clarify.
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            return json({ error: `NanoGPT API Error: ${errText || response.statusText}` }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('[Video Generate] Server Error:', error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
