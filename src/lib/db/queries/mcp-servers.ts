import { db, generateId } from '../index';
import { mcpServers, type McpServer } from '../schema';
import { and, eq } from 'drizzle-orm';
import {
	assertEncryptionEnabled,
	decryptApiKey,
	encryptApiKey,
	isEncrypted,
} from '$lib/encryption';
import { sanitizeHeaders, type HttpHeaders } from '$lib/utils/http-headers';

export type PublicMcpServer = Omit<McpServer, 'authToken' | 'headers'> & {
	hasAuthToken: boolean;
	/** Names only — the values are secrets and never leave the server. */
	headerNames: string[];
};

export function toPublicMcpServer(server: McpServer): PublicMcpServer {
	const { authToken, headers, ...rest } = server;
	return {
		...rest,
		hasAuthToken: Boolean(authToken),
		headerNames: Object.keys(parseHeaders(headers)),
	};
}

/** Stored as an encrypted JSON blob; a corrupt one must not break the whole list. */
export function parseHeaders(raw: string | null): HttpHeaders {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return sanitizeHeaders(parsed) ?? {};
	} catch {
		return {};
	}
}

function decryptServer(server: McpServer): McpServer {
	return {
		...server,
		authToken:
			server.authToken && isEncrypted(server.authToken)
				? decryptApiKey(server.authToken)
				: server.authToken,
		headers:
			server.headers && isEncrypted(server.headers)
				? decryptApiKey(server.headers)
				: server.headers,
	};
}

function encryptToken(token: string | null | undefined): string | null {
	if (typeof token !== 'string' || token.length === 0) return null;
	assertEncryptionEnabled();
	return encryptApiKey(token);
}

function encryptHeaders(headers: HttpHeaders | null | undefined): string | null {
	if (!headers || Object.keys(headers).length === 0) return null;
	assertEncryptionEnabled();
	return encryptApiKey(JSON.stringify(headers));
}

/** Decrypted — server-side use only (tool discovery/execution). */
export async function getMcpServers(userId: string): Promise<McpServer[]> {
	const rows = await db.query.mcpServers.findMany({
		where: eq(mcpServers.userId, userId),
	});
	return rows.map(decryptServer);
}

export async function getEnabledMcpServers(userId: string): Promise<McpServer[]> {
	const rows = await db.query.mcpServers.findMany({
		where: and(eq(mcpServers.userId, userId), eq(mcpServers.enabled, true)),
	});
	return rows.map(decryptServer);
}

export async function getMcpServer(userId: string, id: string): Promise<McpServer | null> {
	const row = await db.query.mcpServers.findFirst({
		where: and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)),
	});
	return row ? decryptServer(row) : null;
}

export async function createMcpServer(
	userId: string,
	data: {
		name: string;
		url: string;
		authToken?: string | null;
		headers?: HttpHeaders | null;
		enabled?: boolean;
	}
): Promise<McpServer> {
	const now = new Date();
	const [row] = await db
		.insert(mcpServers)
		.values({
			id: generateId(),
			userId,
			name: data.name,
			url: data.url,
			authToken: encryptToken(data.authToken),
			headers: encryptHeaders(data.headers),
			enabled: data.enabled ?? true,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	return decryptServer(row!);
}

export async function updateMcpServer(
	userId: string,
	id: string,
	data: {
		name?: string;
		url?: string;
		authToken?: string | null;
		headers?: HttpHeaders | null;
		enabled?: boolean;
	}
): Promise<McpServer | null> {
	const { authToken, headers, ...rest } = data;
	const [row] = await db
		.update(mcpServers)
		.set({
			...rest,
			// undefined leaves the stored secret alone; null clears it
			...(authToken === undefined ? {} : { authToken: encryptToken(authToken) }),
			...(headers === undefined ? {} : { headers: encryptHeaders(headers) }),
			updatedAt: new Date(),
		})
		.where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
		.returning();
	return row ? decryptServer(row) : null;
}

export async function deleteMcpServer(userId: string, id: string): Promise<boolean> {
	const rows = await db
		.delete(mcpServers)
		.where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
		.returning({ id: mcpServers.id });
	return rows.length > 0;
}
