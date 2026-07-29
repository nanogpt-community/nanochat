/**
 * Custom HTTP headers for remote MCP servers.
 *
 * Plenty of remote servers don't use `Authorization: Bearer` — they want
 * `X-Api-Key`, a tenant id, or a beta opt-in header. Users paste those as
 * `Name: value` lines, so parse that shape and refuse anything that could
 * smuggle a second header or a request line.
 */

export type HttpHeaders = Record<string, string>;

/** RFC 7230 token. Deliberately strict — this is user input we put on the wire. */
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * Headers the fetch layer owns. Letting a user set these either breaks the
 * request or lets them point it somewhere we didn't intend.
 */
const FORBIDDEN = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);

export function parseHeaderLines(text: string): { headers: HttpHeaders; errors: string[] } {
	const headers: HttpHeaders = {};
	const errors: string[] = [];

	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line) continue;

		const separator = line.indexOf(':');
		if (separator === -1) {
			errors.push(`"${line}" is not \`Name: value\``);
			continue;
		}

		const name = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();

		if (!HEADER_NAME.test(name)) errors.push(`"${name}" is not a valid header name`);
		else if (FORBIDDEN.has(name.toLowerCase())) errors.push(`"${name}" can't be set`);
		else if (!value) errors.push(`"${name}" has no value`);
		else headers[name] = value;
	}

	return { headers, errors };
}

export function formatHeaderLines(headers: HttpHeaders | null | undefined): string {
	return Object.entries(headers ?? {})
		.map(([name, value]) => `${name}: ${value}`)
		.join('\n');
}

/**
 * Validate a headers object arriving over the API. Returns null if the payload
 * isn't a flat string map or any entry is rejected.
 */
export function sanitizeHeaders(input: unknown): HttpHeaders | null {
	if (input === null || input === undefined) return null;
	if (typeof input !== 'object' || Array.isArray(input)) return null;

	const out: HttpHeaders = {};
	for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
		if (typeof value !== 'string' || !value) return null;
		if (!HEADER_NAME.test(name) || FORBIDDEN.has(name.toLowerCase())) return null;
		// A newline here would let one entry inject additional headers.
		if (/[\r\n]/.test(value)) return null;
		out[name] = value;
	}

	return out;
}
