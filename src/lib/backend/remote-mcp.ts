import { assertPublicHttpUrl } from '$lib/backend/egress';
/**
 * Remote MCP servers configured by the user.
 *
 * Discovers `tools/list` from each enabled server and exposes them to the chat
 * model as OpenAI function tools named `mcp_<server>_<tool>`, then routes calls
 * back over `tools/call`.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { getEnabledMcpServers, parseHeaders } from '$lib/db/queries/mcp-servers';
import type { McpServer } from '$lib/db/schema';

export const MCP_TOOL_PREFIX = 'mcp_';

type ToolRoute = { server: McpServer; toolName: string };

export type RemoteMcpTools = {
	tools: ChatCompletionTool[];
	/** prefixed tool name -> where to send the call */
	routes: Map<string, ToolRoute>;
};

const EMPTY: RemoteMcpTools = { tools: [], routes: new Map() };

/**
 * Only remote HTTP(S) servers — no stdio, nothing that runs a local process — and
 * only public destinations unless ALLOW_PRIVATE_INTEGRATIONS is set. Checked on
 * every connect, not just at save time, so a DNS change can't move a stored
 * server onto the LAN later.
 */
async function connect(server: McpServer): Promise<Client> {
	const url = await assertPublicHttpUrl(server.url, 'MCP server');

	// Bearer token first so an explicit Authorization header can override it.
	const extra: Record<string, string> = {
		...(server.authToken ? { Authorization: `Bearer ${server.authToken}` } : {}),
		...parseHeaders(server.headers),
	};

	// Redirects are refused: a public host answering 302 to an internal address
	// would otherwise carry the account's headers there.
	const authFetch: typeof fetch = (input, init) =>
		fetch(input, {
			...init,
			redirect: 'error',
			headers: { ...Object.fromEntries(new Headers(init?.headers)), ...extra },
		});

	const client = new Client({ name: 'nanochat', version: '1.0.0' });
	try {
		await client.connect(new StreamableHTTPClientTransport(url, { fetch: authFetch }));
	} catch {
		// ponytail: streamable HTTP is the current spec, but plenty of deployed
		// servers still only speak the deprecated SSE transport.
		await client.connect(new SSEClientTransport(url, { fetch: authFetch }));
	}
	return client;
}

/** OpenAI requires ^[a-zA-Z0-9_-]{1,64}$ for tool names. */
function sanitize(part: string): string {
	return part.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Budget the 64 chars tool-name-first: a long server name must not eat the part
 * that distinguishes one tool from another, or they'd collide and get dropped.
 */
export function prefixedName(serverName: string, toolName: string): string {
	const tool = sanitize(toolName).slice(0, 48);
	const prefix = `${MCP_TOOL_PREFIX}${sanitize(serverName)}`.slice(0, 63 - tool.length);
	return `${prefix}_${tool}`;
}

// ponytail: per-user in-memory cache. Discovery costs a connect + handshake per
// server, and it would otherwise run on every single chat message. Swap for a
// shared store if this ever runs multi-process.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: RemoteMcpTools }>();

export function invalidateRemoteMcpTools(userId: string): void {
	cache.delete(userId);
}

export async function listServerTools(
	server: McpServer
): Promise<Array<{ name: string; description?: string; inputSchema: unknown }>> {
	const client = await connect(server);
	try {
		const { tools } = await client.listTools();
		return tools;
	} finally {
		await client.close().catch(() => {});
	}
}

export async function getRemoteMcpTools(userId: string): Promise<RemoteMcpTools> {
	const hit = cache.get(userId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

	const servers = await getEnabledMcpServers(userId);
	if (servers.length === 0) {
		cache.set(userId, { at: Date.now(), value: EMPTY });
		return EMPTY;
	}

	const tools: ChatCompletionTool[] = [];
	const routes = new Map<string, ToolRoute>();

	// A broken server must not take down the whole chat — skip it and carry on.
	const listed = await Promise.allSettled(servers.map((s) => listServerTools(s)));

	for (const [i, result] of listed.entries()) {
		const server = servers[i]!;
		if (result.status === 'rejected') {
			console.error(`MCP server "${server.name}" tool discovery failed:`, result.reason);
			continue;
		}
		for (const tool of result.value) {
			const name = prefixedName(server.name, tool.name);
			if (routes.has(name)) continue;
			routes.set(name, { server, toolName: tool.name });
			tools.push({
				type: 'function',
				function: {
					name,
					description: tool.description ?? `${tool.name} (via ${server.name})`,
					parameters: (tool.inputSchema as Record<string, unknown>) ?? {
						type: 'object',
						properties: {},
					},
				},
			});
		}
	}

	const value = { tools, routes };
	cache.set(userId, { at: Date.now(), value });
	return value;
}

export async function executeRemoteMcpTool(
	route: ToolRoute,
	args: Record<string, unknown>
): Promise<{ success: boolean; result: string; error?: string }> {
	// ponytail: one connection per call. Pool it if latency shows up in traces.
	let client: Client;
	try {
		client = await connect(route.server);
	} catch (e) {
		return {
			success: false,
			result: '',
			error: `Could not reach MCP server "${route.server.name}": ${e instanceof Error ? e.message : e}`,
		};
	}

	try {
		const res = await client.callTool({ name: route.toolName, arguments: args });
		const text = (Array.isArray(res.content) ? res.content : [])
			.map((part: { type?: string; text?: string }) =>
				part?.type === 'text' ? (part.text ?? '') : `[${part?.type ?? 'unknown'} content omitted]`
			)
			.join('\n')
			.trim();

		if (res.isError) {
			return { success: false, result: '', error: text || 'Tool reported an error' };
		}
		return { success: true, result: text || JSON.stringify(res.structuredContent ?? res) };
	} catch (e) {
		return {
			success: false,
			result: '',
			error: e instanceof Error ? e.message : 'Unknown MCP error',
		};
	} finally {
		await client.close().catch(() => {});
	}
}
