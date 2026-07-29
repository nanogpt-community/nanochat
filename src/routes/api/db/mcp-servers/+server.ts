import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createMcpServer,
	deleteMcpServer,
	getMcpServer,
	getMcpServers,
	toPublicMcpServer,
	updateMcpServer,
} from '$lib/db/queries/mcp-servers';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { assertEncryptionEnabled } from '$lib/encryption';
import { jsonNoStore } from '$lib/backend/http-security';
import { invalidateRemoteMcpTools, listServerTools } from '$lib/backend/remote-mcp';
import { sanitizeHeaders, type HttpHeaders } from '$lib/utils/http-headers';

function validUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
	} catch {
		return null;
	}
}

// GET - list the user's MCP servers (auth tokens never leave the server)
export const GET: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const servers = await getMcpServers(userId);
	return jsonNoStore(servers.map(toPublicMcpServer));
};

// POST - create a server, update one, or test its connection
export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const body = await request.json();
	const action = body.action ?? 'create';

	// undefined means "leave the stored value alone"; null clears it
	let headers: HttpHeaders | null | undefined;
	if (body.headers !== undefined) {
		headers = sanitizeHeaders(body.headers);
		if (body.headers !== null && headers === null) {
			return error(400, 'Invalid headers: expected a flat object of header names to string values');
		}
	}

	if (action === 'test') {
		const server = body.id
			? await getMcpServer(userId, body.id)
			: {
					name: 'test',
					url: validUrl(body.url) ?? '',
					authToken: typeof body.authToken === 'string' ? body.authToken : null,
					headers: headers ? JSON.stringify(headers) : null,
				};
		if (!server?.url) return error(400, 'A valid http(s) URL is required');

		try {
			const tools = await listServerTools(server as Parameters<typeof listServerTools>[0]);
			return jsonNoStore({ ok: true, tools: tools.map((t) => t.name) });
		} catch (e) {
			return jsonNoStore({
				ok: false,
				error: e instanceof Error ? e.message : 'Connection failed',
			});
		}
	}

	const storingSecret =
		(typeof body.authToken === 'string' && body.authToken.length > 0) ||
		(headers !== null && headers !== undefined && Object.keys(headers).length > 0);

	if (storingSecret) {
		try {
			assertEncryptionEnabled();
		} catch (e) {
			return error(503, e instanceof Error ? e.message : 'Secret storage is not configured');
		}
	}

	if (action === 'update') {
		if (!body.id) return error(400, 'Missing id');
		if (body.url !== undefined && !validUrl(body.url)) return error(400, 'Invalid url');

		const updated = await updateMcpServer(userId, body.id, {
			name: body.name,
			url: body.url === undefined ? undefined : validUrl(body.url)!,
			authToken: body.authToken,
			headers,
			enabled: body.enabled,
		});
		if (!updated) return error(404, 'MCP server not found');

		invalidateRemoteMcpTools(userId);
		return jsonNoStore(toPublicMcpServer(updated));
	}

	const name = typeof body.name === 'string' ? body.name.trim() : '';
	const url = validUrl(body.url);
	if (!name) return error(400, 'Missing name');
	if (!url) return error(400, 'A valid http(s) URL is required');

	const created = await createMcpServer(userId, {
		name,
		url,
		authToken: body.authToken,
		headers,
		enabled: body.enabled ?? true,
	});

	invalidateRemoteMcpTools(userId);
	return jsonNoStore(toPublicMcpServer(created));
};

// DELETE - remove a server
export const DELETE: RequestHandler = async ({ request, url }) => {
	const userId = await getAuthenticatedUserId(request);
	const id = url.searchParams.get('id');
	if (!id) return error(400, 'Missing id');

	const deleted = await deleteMcpServer(userId, id);
	if (!deleted) return error(404, 'MCP server not found');

	invalidateRemoteMcpTools(userId);
	return jsonNoStore({ ok: true });
};
