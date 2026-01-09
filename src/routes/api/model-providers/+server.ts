import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db';
import { userKeys } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

/**
 * GET /api/model-providers?modelId=xxx
 * Proxies to NanoGPT API to get available providers for a model
 */
export const GET: RequestHandler = async ({ url, request }) => {
    const modelId = url.searchParams.get('modelId');

    if (!modelId) {
        return json({ error: 'modelId is required' }, { status: 400 });
    }

    // Get session using auth helper
    const userId = await getAuthenticatedUserId(request);

    // Get user's NanoGPT API key
    const userKey = await db.query.userKeys.findFirst({
        where: and(
            eq(userKeys.userId, userId),
            eq(userKeys.provider, 'nanogpt')
        ),
    });

    let apiKey = userKey?.key;
    if (apiKey && isEncrypted(apiKey)) {
        apiKey = decryptApiKey(apiKey);
    }

    if (!apiKey) {
        // Return empty response if no API key - model doesn't support provider selection for this user
        return json({
            canonicalId: modelId,
            displayName: modelId,
            supportsProviderSelection: false,
            providers: [],
        });
    }

    try {
        // Fetch providers from NanoGPT API
        const response = await fetch(`https://nano-gpt.com/api/models/${encodeURIComponent(modelId)}/providers`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            // If model doesn't support provider selection, return a default response
            if (response.status === 404) {
                return json({
                    canonicalId: modelId,
                    displayName: modelId,
                    supportsProviderSelection: false,
                    providers: [],
                });
            }

            const errorText = await response.text();
            console.error('NanoGPT providers API error:', response.status, errorText);
            return json({
                canonicalId: modelId,
                displayName: modelId,
                supportsProviderSelection: false,
                providers: [],
            });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error fetching model providers:', error);
        return json({
            canonicalId: modelId,
            displayName: modelId,
            supportsProviderSelection: false,
            providers: [],
        });
    }
};

