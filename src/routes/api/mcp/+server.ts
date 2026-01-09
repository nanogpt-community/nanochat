import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getUserSettings } from '$lib/db/queries';
import { getUserKey } from '$lib/db/queries/user-keys';
import { isSubscriptionOnlyMode } from '$lib/backend/message-limits';

/**
 * MCP (Model Context Protocol) API endpoint
 * Handles MCP tool calls with restrictions for subscription-only mode
 */

// POST - execute MCP tool call
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    // Check if MCP is enabled for user
    const userSettings = await getUserSettings(userId);
    if (!userSettings?.mcpEnabled) {
        return error(403, 'MCP is not enabled. Enable it in Account Settings.');
    }

    // Check if user is using server key with subscription-only mode
    // getUserKey returns the decrypted key string directly, or null
    const userApiKey = await getUserKey(userId, 'nanogpt');
    const hasOwnApiKey = !!userApiKey;
    const usingServerKey = !hasOwnApiKey && !!process.env.NANOGPT_API_KEY;

    if (usingServerKey && isSubscriptionOnlyMode()) {
        return error(
            403,
            'MCP is not available when using the server API key with subscription-only mode. Please add your own NanoGPT API key.'
        );
    }

    // Get the API key to use
    const apiKey = userApiKey || process.env.NANOGPT_API_KEY;

    if (!apiKey) {
        return error(403, 'No API key available. Please add your NanoGPT API key in Settings.');
    }

    // Parse the request body for tool call
    const body = await request.json();
    const { tool, args } = body;

    if (!tool) {
        return error(400, 'Missing tool name');
    }

    // TODO: Implement actual MCP tool call routing
    // For now, return a placeholder response indicating the endpoint is ready
    // The actual MCP tool implementation will depend on how the chat interface
    // wants to invoke MCP tools (e.g., via generate-message or directly)

    return json({
        ok: true,
        message: 'MCP endpoint ready',
        tool,
        args,
        note: 'MCP tool execution will be integrated with the chat flow',
    });
};

// GET - check MCP status for user
export const GET: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    const userSettings = await getUserSettings(userId);
    const userApiKey = await getUserKey(userId, 'nanogpt');
    const hasOwnApiKey = !!userApiKey;
    const usingServerKey = !hasOwnApiKey && !!process.env.NANOGPT_API_KEY;

    const mcpEnabled = userSettings?.mcpEnabled ?? false;
    const mcpAvailable = !(usingServerKey && isSubscriptionOnlyMode());

    return json({
        enabled: mcpEnabled,
        available: mcpAvailable,
        reason: !mcpAvailable
            ? 'MCP is not available when using the server API key with subscription-only mode'
            : undefined,
    });
};
