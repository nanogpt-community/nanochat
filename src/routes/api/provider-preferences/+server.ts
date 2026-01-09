import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db';
import { userKeys } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod/v4';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// Schema for provider preferences
const providerPreferencesSchema = z.object({
    preferredProviders: z.array(z.string()).optional(),
    excludedProviders: z.array(z.string()).optional(),
    enableFallback: z.boolean().optional(),
    modelOverrides: z.record(z.string(), z.object({
        preferredProviders: z.array(z.string()).optional(),
        enableFallback: z.boolean().optional(),
    })).optional(),
});

export type ProviderPreferences = z.infer<typeof providerPreferencesSchema>;

// Helper to get user's NanoGPT API key
async function getNanoGPTKey(userId: string) {
    const userKey = await db.query.userKeys.findFirst({
        where: and(
            eq(userKeys.userId, userId),
            eq(userKeys.provider, 'nanogpt')
        ),
    });
    if (!userKey?.key) return undefined;
    // Decrypt if encrypted
    if (isEncrypted(userKey.key)) {
        return decryptApiKey(userKey.key);
    }
    return userKey.key;
}

/**
 * GET /api/provider-preferences
 * Get user's provider preferences from NanoGPT API
 */
export const GET: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    const apiKey = await getNanoGPTKey(userId);
    if (!apiKey) {
        return json({ error: 'NanoGPT API key not configured' }, { status: 400 });
    }

    try {
        const response = await fetch('https://nano-gpt.com/api/user/provider-preferences', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            // If 404, return empty preferences (user hasn't set any yet)
            if (response.status === 404) {
                return json({
                    preferredProviders: [],
                    excludedProviders: [],
                    enableFallback: true,
                    modelOverrides: {},
                    availableProviders: [],
                });
            }

            const errorText = await response.text();
            console.error('NanoGPT provider preferences GET error:', response.status, errorText);
            return json({ error: 'Failed to fetch provider preferences' }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error fetching provider preferences:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

/**
 * PATCH /api/provider-preferences
 * Update user's provider preferences via NanoGPT API
 */
export const PATCH: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    const apiKey = await getNanoGPTKey(userId);
    if (!apiKey) {
        return json({ error: 'NanoGPT API key not configured' }, { status: 400 });
    }


    // Parse and validate request body
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parseResult = providerPreferencesSchema.safeParse(body);
    if (!parseResult.success) {
        return json({ error: 'Invalid request body', details: parseResult.error.issues }, { status: 422 });
    }

    try {
        const response = await fetch('https://nano-gpt.com/api/user/provider-preferences', {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(parseResult.data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('NanoGPT provider preferences PATCH error:', response.status, errorData);
            return json({
                error: errorData.message || 'Failed to update provider preferences',
                code: errorData.code,
            }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error updating provider preferences:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

/**
 * DELETE /api/provider-preferences
 * Delete user's provider preferences via NanoGPT API
 */
export const DELETE: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    const apiKey = await getNanoGPTKey(userId);
    if (!apiKey) {
        return json({ error: 'NanoGPT API key not configured' }, { status: 400 });
    }

    try {
        const response = await fetch('https://nano-gpt.com/api/user/provider-preferences', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('NanoGPT provider preferences DELETE error:', response.status, errorText);
            return json({ error: 'Failed to delete provider preferences' }, { status: response.status });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error deleting provider preferences:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
