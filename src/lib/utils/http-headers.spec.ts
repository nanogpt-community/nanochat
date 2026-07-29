import { describe, expect, it } from 'vitest';
import { formatHeaderLines, parseHeaderLines, sanitizeHeaders } from './http-headers';

describe('parseHeaderLines', () => {
	it('parses the shape users actually paste', () => {
		const { headers, errors } = parseHeaderLines('X-Api-Key: abc123\n\nX-Tenant:  acme  ');
		expect(headers).toEqual({ 'X-Api-Key': 'abc123', 'X-Tenant': 'acme' });
		expect(errors).toEqual([]);
	});

	it('keeps colons in the value', () => {
		const { headers } = parseHeaderLines('X-Url: https://example.com:8443/a');
		expect(headers['X-Url']).toBe('https://example.com:8443/a');
	});

	it('reports bad lines instead of silently dropping them', () => {
		const { headers, errors } = parseHeaderLines('nonsense\nBad Name: x\nX-Ok: 1\nX-Empty:');
		expect(headers).toEqual({ 'X-Ok': '1' });
		expect(errors).toHaveLength(3);
	});

	it('round-trips through formatHeaderLines', () => {
		const text = 'X-A: 1\nX-B: 2';
		expect(formatHeaderLines(parseHeaderLines(text).headers)).toBe(text);
	});
});

describe('sanitizeHeaders', () => {
	it('accepts a flat string map', () => {
		expect(sanitizeHeaders({ 'X-Api-Key': 'k' })).toEqual({ 'X-Api-Key': 'k' });
		expect(sanitizeHeaders(null)).toBeNull();
	});

	it('rejects header injection via newlines in the value', () => {
		expect(sanitizeHeaders({ 'X-A': 'ok\r\nX-Evil: yes' })).toBeNull();
	});

	it('rejects headers the fetch layer owns', () => {
		expect(sanitizeHeaders({ Host: 'evil.example.com' })).toBeNull();
		expect(sanitizeHeaders({ 'content-length': '0' })).toBeNull();
	});

	it('rejects malformed payloads', () => {
		expect(sanitizeHeaders(['X-A: 1'])).toBeNull();
		expect(sanitizeHeaders({ 'X-A': 42 })).toBeNull();
		expect(sanitizeHeaders({ 'Bad Name': 'v' })).toBeNull();
	});
});
