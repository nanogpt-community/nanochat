import { describe, expect, it } from 'vitest';
import { getRedirectTo } from './redirect';

const at = (redirectTo: string) =>
	getRedirectTo(new URL(`https://app.example/login?redirect_to=${encodeURIComponent(redirectTo)}`));

describe('getRedirectTo', () => {
	it('keeps same-origin paths', () => {
		expect(at('/chat/abc?x=1#y')).toBe('/chat/abc?x=1#y');
	});

	it('refuses external and scheme-relative destinations', () => {
		for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'chat']) {
			expect(at(bad), bad).toBeNull();
		}
	});
});
