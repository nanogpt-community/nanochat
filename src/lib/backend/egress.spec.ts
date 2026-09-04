import { describe, expect, it } from 'vitest';
import { isPrivateAddress, assertPublicHttpUrl } from './egress';

describe('isPrivateAddress', () => {
	it('flags loopback, RFC1918, link-local, CGNAT and mapped addresses', () => {
		for (const ip of [
			'127.0.0.1',
			'10.1.2.3',
			'172.16.0.1',
			'192.168.1.1',
			'169.254.169.254',
			'100.64.0.1',
			'0.0.0.0',
			'::1',
			'fd00::1',
			'fe80::1',
			'::ffff:10.0.0.1',
			'64:ff9b::a00:1',
		]) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
	});

	it('passes public addresses', () => {
		for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111', '172.32.0.1']) {
			expect(isPrivateAddress(ip), ip).toBe(false);
		}
	});
});

describe('assertPublicHttpUrl', () => {
	it('rejects non-http schemes, localhost and literal private addresses', async () => {
		await expect(assertPublicHttpUrl('ftp://example.com', 'x')).rejects.toThrow();
		await expect(assertPublicHttpUrl('http://localhost:8080', 'x')).rejects.toThrow();
		await expect(assertPublicHttpUrl('http://192.168.0.5/mcp', 'x')).rejects.toThrow();
		await expect(assertPublicHttpUrl('http://[::1]/', 'x')).rejects.toThrow();
	});

	it('accepts a literal public address', async () => {
		const url = await assertPublicHttpUrl('https://1.1.1.1/api', 'x');
		expect(url.hostname).toBe('1.1.1.1');
	});
});
