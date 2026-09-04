import {
	mcpToolDefinitions,
	executeMcpTool,
	isMcpAvailable,
	type McpToolOptions,
} from '$lib/backend/mcp-tools';
import { getRemoteMcpTools, executeRemoteMcpTool } from '$lib/backend/remote-mcp';
import { isSubscriptionOnlyMode } from '$lib/backend/message-limits';
import type { FormattedMessage } from './prompt';
import type { Log } from './schema';

export type ToolCall = {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
};

export type ToolResultMessage = { role: 'tool'; tool_call_id: string; content: string };

type RemoteMcp = Awaited<ReturnType<typeof getRemoteMcpTools>>;

/** Streaming tool calls arrive as fragments keyed by index; fold them into `target`. */
export function mergeToolCallDeltas(target: ToolCall[], deltas: unknown): void {
	if (!Array.isArray(deltas)) return;
	for (const dtc of deltas as Array<{
		index: number;
		id?: string;
		function?: { name?: string; arguments?: string };
	}>) {
		const idx = dtc.index;
		// Validate index is a non-negative integer to prevent prototype pollution
		if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) continue;
		if (!target[idx]) {
			target[idx] = { id: dtc.id || '', type: 'function', function: { name: '', arguments: '' } };
		}
		if (dtc.id) target[idx].id = dtc.id;
		if (dtc.function?.name) target[idx].function.name += dtc.function.name;
		if (dtc.function?.arguments) target[idx].function.arguments += dtc.function.arguments;
	}
}

export async function resolveTools(opts: {
	mcpEnabled: boolean;
	usingServerKey: boolean;
	webSearchActive: boolean;
	userId: string;
	log: Log;
}): Promise<{ tools: typeof mcpToolDefinitions | undefined; remoteMcp: RemoteMcp }> {
	const mcpAvailable = isMcpAvailable(
		opts.mcpEnabled,
		opts.usingServerKey,
		isSubscriptionOnlyMode()
	);
	if (mcpAvailable) opts.log('MCP tools enabled for this request');

	// Native web search already covers the search tool; offering both makes the
	// model pick the tool over the multi-provider native integration.
	const builtin = mcpAvailable
		? mcpToolDefinitions.filter(
				(t) =>
					!(
						opts.webSearchActive &&
						t.type === 'function' &&
						t.function.name === 'nanogpt_web_search'
					)
			)
		: [];

	// User-configured remote MCP servers run on the user's own credentials, so
	// they're independent of the NanoGPT MCP toggle and its key restrictions.
	const remoteMcp = await getRemoteMcpTools(opts.userId).catch((e) => {
		opts.log(`Remote MCP discovery failed: ${e}`);
		return { tools: [], routes: new Map() } as RemoteMcp;
	});
	if (remoteMcp.tools.length > 0)
		opts.log(`${remoteMcp.tools.length} remote MCP tool(s) available`);

	const all = [...builtin, ...remoteMcp.tools];
	return { tools: all.length > 0 ? all : undefined, remoteMcp };
}

function lastImageUrl(formattedMessages: FormattedMessage[]): string | null {
	for (let i = formattedMessages.length - 1; i >= 0; i--) {
		const content = formattedMessages[i]?.content;
		if (!Array.isArray(content)) continue;
		const img = content.find((p) => p.type === 'image_url');
		if (img && 'image_url' in img) return img.image_url.url;
	}
	return null;
}

export async function executeToolCalls(opts: {
	toolCalls: ToolCall[];
	remoteMcp: RemoteMcp;
	formattedMessages: FormattedMessage[];
	apiKey: string;
	mcpOptions: McpToolOptions;
	log: Log;
}): Promise<ToolResultMessage[]> {
	const results: ToolResultMessage[] = [];
	for (const tc of opts.toolCalls) {
		if (!tc.id || !tc.function.name) continue;
		try {
			const args = JSON.parse(tc.function.arguments || '{}');
			const route = opts.remoteMcp.routes.get(tc.function.name);

			// The vision tool often gets called without the image the user just
			// attached; fall back to the most recent one in context.
			if (!route && tc.function.name === 'nanogpt_vision') {
				const url = args.image_url as string | undefined;
				if (!url || (!url.startsWith('http') && !url.startsWith('data:'))) {
					const found = lastImageUrl(opts.formattedMessages);
					if (found) {
						args.image_url = found;
						opts.log('Injected image from context into vision tool');
					}
				}
			}

			opts.log(`Executing tool ${tc.function.name}`);
			const result = route
				? await executeRemoteMcpTool(route, args)
				: await executeMcpTool(tc.function.name, args, opts.apiKey, opts.mcpOptions);
			results.push({
				role: 'tool',
				tool_call_id: tc.id,
				content: result.success ? result.result : `Error: ${result.error}`,
			});
			opts.log(`Tool ${tc.function.name} completed`);
		} catch (e) {
			opts.log(`Tool ${tc.function.name} failed: ${e}`);
			results.push({
				role: 'tool',
				tool_call_id: tc.id,
				content: `Error executing tool: ${e instanceof Error ? e.message : 'Unknown error'}`,
			});
		}
	}
	return results;
}
