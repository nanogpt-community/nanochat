import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * User-configured destinations (MCP servers, Karakeep) are fetched by the server
 * with user-chosen headers, which makes them a request primitive against anything
 * the server can reach. Private ranges are blocked unless the operator opts in.
 */
export function privateIntegrationsAllowed(): boolean {
	const explicit = process.env.ALLOW_PRIVATE_INTEGRATIONS;
	if (explicit === 'true') return true;
	if (explicit === 'false') return false;
	// Unset: a closed-signup install is one trusted operator, and LAN integrations
	// are the normal case there. Only open signups get the strict default.
	return process.env.DISABLE_SIGNUPS === 'true';
}

export function isPrivateAddress(ip: string): boolean {
	const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
	const v4 = mapped ?? (isIP(ip) === 4 ? ip : null);
	if (v4) {
		const [a = 0, b = 0] = v4.split('.').map(Number);
		return (
			a === 0 || // "this" network
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
			(a === 169 && b === 254) || // link-local, cloud metadata
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 0) || // 192.0.0.0/24 and 192.0.2.0/24
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224 // multicast and reserved
		);
	}
	const v6 = ip.toLowerCase();
	return (
		v6 === '::' ||
		v6 === '::1' ||
		v6.startsWith('fc') ||
		v6.startsWith('fd') || // unique local
		/^fe[89ab]/.test(v6) || // link-local
		v6.startsWith('ff') || // multicast
		v6.startsWith('64:ff9b') || // NAT64, would smuggle a v4 target
		v6.startsWith('2002:') // 6to4
	);
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/**
 * Parse and vet a destination. Resolves the host and rejects any answer inside a
 * private, loopback, link-local, multicast or reserved range.
 */
export async function assertPublicHttpUrl(raw: string, purpose: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`${purpose}: invalid URL`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`${purpose}: only http(s) URLs are allowed`);
	}
	if (privateIntegrationsAllowed()) return url;

	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (host === 'localhost' || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
		throw new Error(`${purpose}: ${host} is not a public host`);
	}

	const addresses = isIP(host)
		? [host]
		: await lookup(host, { all: true })
				.then((rs) => rs.map((r) => r.address))
				.catch(() => {
					throw new Error(`${purpose}: could not resolve ${host}`);
				});

	if (addresses.some(isPrivateAddress)) {
		throw new Error(
			`${purpose}: ${host} points at a private network. With signups open this is blocked; set ALLOW_PRIVATE_INTEGRATIONS=true to permit LAN destinations.`
		);
	}
	return url;
}
