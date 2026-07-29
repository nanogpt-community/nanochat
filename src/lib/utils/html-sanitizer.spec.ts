import { describe, expect, it } from 'vitest';
import { sanitizeHtml, toSafeHttpUrl, toSafeResourceUrl } from './html-sanitizer';

describe('sanitizeHtml', () => {
	it('removes executable script content and event handlers', () => {
		const html =
			'<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a><p>safe</p></div>';

		const sanitized = sanitizeHtml(html);

		expect(sanitized).toContain('<div>');
		expect(sanitized).toContain('<p>safe</p>');
		expect(sanitized).not.toContain('onclick=');
		expect(sanitized).not.toContain('<script');
		expect(sanitized).not.toContain('javascript:');
	});

	it('keeps safe markdown copy buttons without inline JavaScript', () => {
		const html =
			'<button class="copy" type="button" data-code="console.log(1)" data-copy-button="true" onclick="evil()"><span>Copy</span></button>';

		const sanitized = sanitizeHtml(html);

		expect(sanitized).toContain('data-copy-button="true"');
		expect(sanitized).toContain('data-code="console.log(1)"');
		expect(sanitized).not.toContain('onclick=');
	});
});

describe('toSafeHttpUrl', () => {
	it('allows http and https URLs', () => {
		expect(toSafeHttpUrl('https://example.com/path')).toBe('https://example.com/path');
		expect(toSafeHttpUrl('http://example.com/path')).toBe('http://example.com/path');
	});

	it('rejects non-http protocols', () => {
		expect(toSafeHttpUrl('javascript:alert(1)')).toBeNull();
		expect(toSafeHttpUrl('data:text/html,hi')).toBeNull();
	});
});

describe('toSafeResourceUrl', () => {
	it('allows safe resource URLs', () => {
		expect(toSafeResourceUrl('https://example.com/video.mp4')).toBe(
			'https://example.com/video.mp4'
		);
		expect(toSafeResourceUrl('/api/storage/file123')).toBe('/api/storage/file123');
		expect(toSafeResourceUrl('blob:https://example.com/123')).toBe('blob:https://example.com/123');
	});

	it('rejects unsafe or ambiguous resource URLs', () => {
		expect(toSafeResourceUrl('javascript:alert(1)')).toBeNull();
		expect(toSafeResourceUrl('data:image/svg+xml,<svg></svg>')).toBeNull();
		expect(toSafeResourceUrl('//example.com/image.png')).toBeNull();
	});

	// Browsers strip ASCII tab/LF/CR from a URL before parsing its scheme, so a scheme
	// check against the raw string can be walked straight past: `java<TAB>script:` was
	// emitted verbatim and then executed as `javascript:`. Verified exploitable against
	// the previous implementation.
	it('strips control characters smuggled into a URL scheme', () => {
		for (const smuggled of [
			'java\tscript:alert(1)',
			'java\nscript:alert(1)',
			'java\rscript:alert(1)',
			'ja\tva\nscript:alert(1)',
			'java\u0000script:alert(1)',
		]) {
			for (const html of [`<a href="${smuggled}">x</a>`, `<img src="${smuggled}">`]) {
				const attr = sanitizeHtml(html).match(/(?:href|src)="([^"]*)"/)?.[1] ?? '';
				// What the browser is left with after it discards those characters.
				const asBrowserParsesIt = attr.replace(/[\t\n\r]/g, '').toLowerCase();
				expect(asBrowserParsesIt.startsWith('javascript:')).toBe(false);
			}
		}
	});

	it('leaves ordinary URLs untouched', () => {
		const cases: [string, string][] = [
			['<a href="https://example.com/a?b=1#c">x</a>', 'https://example.com/a?b=1#c'],
			['<a href="/chat/123">x</a>', '/chat/123'],
			['<a href="mailto:a@b.com">x</a>', 'mailto:a@b.com'],
			['<a href="#section">x</a>', '#section'],
			['<img src="/api/storage/abc">', '/api/storage/abc'],
		];

		for (const [html, expected] of cases) {
			expect(sanitizeHtml(html).match(/(?:href|src)="([^"]*)"/)?.[1]).toBe(expected);
		}
	});
});
