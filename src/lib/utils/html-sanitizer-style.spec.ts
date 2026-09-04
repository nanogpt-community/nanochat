import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeStyle } from './html-sanitizer';

describe('sanitizeStyle', () => {
	it('keeps text-level properties and drops layout and resources', () => {
		expect(
			sanitizeStyle(
				'position:fixed;inset:0;z-index:9999;background:url(https://evil.example/b.gif);color:#ff0000;font-weight:bold'
			)
		).toBe('color:#ff0000;font-weight:bold');
	});

	it('allows shiki custom properties but no other var() references', () => {
		expect(sanitizeStyle('--shiki-dark:#abc;color:var(--shiki-dark)')).toBe(
			'--shiki-dark:#abc;color:var(--shiki-dark)'
		);
		expect(sanitizeStyle('color:var(--anything)')).toBeNull();
	});

	it('removes the attribute entirely when nothing survives', () => {
		expect(sanitizeHtml('<div style="position:fixed">x</div>')).toBe('<div>x</div>');
	});
});
