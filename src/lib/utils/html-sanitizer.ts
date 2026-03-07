import { parseDocument } from 'htmlparser2';

type HtmlNode = {
	type?: string;
	name?: string;
	attribs?: Record<string, string>;
	data?: string;
	children?: HtmlNode[];
};

const ALLOWED_TAGS = new Set([
	'a',
	'blockquote',
	'br',
	'button',
	'code',
	'del',
	'details',
	'div',
	'em',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'img',
	'li',
	'ol',
	'p',
	'path',
	'pre',
	'rect',
	'source',
	'span',
	'strong',
	'summary',
	'svg',
	'table',
	'tbody',
	'td',
	'th',
	'thead',
	'tr',
	'ul',
	'video',
]);

const DROP_CONTENT_TAGS = new Set([
	'base',
	'embed',
	'form',
	'frame',
	'frameset',
	'head',
	'iframe',
	'input',
	'link',
	'meta',
	'object',
	'script',
	'select',
	'style',
	'textarea',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img', 'source']);

const GLOBAL_ATTRIBUTES = new Set([
	'aria-hidden',
	'aria-label',
	'aria-live',
	'class',
	'dir',
	'lang',
	'role',
	'style',
	'tabindex',
	'title',
]);

const TAG_ATTRIBUTES: Record<string, Set<string>> = {
	a: new Set(['href', 'target', 'rel']),
	button: new Set(['data-code', 'data-copy-button', 'type']),
	img: new Set(['alt', 'decoding', 'height', 'loading', 'src', 'width']),
	path: new Set(['d', 'fill', 'stroke', 'stroke-linecap', 'stroke-linejoin', 'stroke-width']),
	rect: new Set(['fill', 'height', 'rx', 'ry', 'stroke', 'stroke-width', 'width', 'x', 'y']),
	source: new Set(['src', 'type']),
	svg: new Set([
		'aria-hidden',
		'fill',
		'focusable',
		'height',
		'stroke',
		'stroke-linecap',
		'stroke-linejoin',
		'stroke-width',
		'viewbox',
		'width',
		'xmlns',
	]),
	td: new Set(['colspan', 'rowspan']),
	th: new Set(['colspan', 'rowspan', 'scope']),
	video: new Set([
		'autoplay',
		'controls',
		'loop',
		'muted',
		'playsinline',
		'poster',
		'preload',
		'src',
	]),
};

const BOOLEAN_ATTRIBUTES = new Set([
	'autoplay',
	'controls',
	'focusable',
	'loop',
	'muted',
	'open',
	'playsinline',
]);

const URL_ATTRIBUTES = new Set(['href', 'poster', 'src']);
const SAFE_PROTOCOLS = new Set(['blob:', 'http:', 'https:', 'mailto:', 'tel:']);
const SAFE_STYLE_PATTERN =
	/^(?!.*(?:expression\s*\(|javascript:|data:text\/html|data:application|vbscript:|@import|-moz-binding|behavior\s*:)).*$/i;

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function isSafeUrl(value: string): boolean {
	const trimmed = value.trim();

	if (!trimmed) {
		return false;
	}

	if (
		trimmed.startsWith('#') ||
		trimmed.startsWith('/') ||
		trimmed.startsWith('./') ||
		trimmed.startsWith('../') ||
		trimmed.startsWith('//')
	) {
		return true;
	}

	const protocolMatch = trimmed.match(/^([a-zA-Z][a-zA-Z\d+\-.]*:)/);
	if (!protocolMatch) {
		return true;
	}

	const protocol = protocolMatch[1];
	if (!protocol) {
		return false;
	}

	return SAFE_PROTOCOLS.has(protocol.toLowerCase());
}

function sanitizeAttribute(tagName: string, name: string, value: string): string | null {
	const normalizedName = name.toLowerCase();

	if (normalizedName.startsWith('on')) {
		return null;
	}

	const allowedAttributes = TAG_ATTRIBUTES[tagName];
	if (!GLOBAL_ATTRIBUTES.has(normalizedName) && !allowedAttributes?.has(normalizedName)) {
		return null;
	}

	const trimmedValue = value.trim();

	if (URL_ATTRIBUTES.has(normalizedName) && !isSafeUrl(trimmedValue)) {
		return null;
	}

	if (normalizedName === 'style' && !SAFE_STYLE_PATTERN.test(trimmedValue)) {
		return null;
	}

	if (normalizedName === 'target') {
		return trimmedValue === '_blank' ? '_blank' : null;
	}

	if (normalizedName === 'rel') {
		return tagName === 'a' ? 'noopener noreferrer' : null;
	}

	if (normalizedName === 'type' && tagName === 'button') {
		return trimmedValue === 'button' ? 'button' : null;
	}

	if (BOOLEAN_ATTRIBUTES.has(normalizedName)) {
		return trimmedValue === '' || trimmedValue.toLowerCase() === normalizedName
			? normalizedName
			: null;
	}

	return trimmedValue;
}

function sanitizeNode(node: HtmlNode): string {
	const nodeType = node.type ?? '';

	if (nodeType === 'text') {
		return escapeHtml(node.data ?? '');
	}

	if (nodeType === 'comment' || nodeType === 'directive' || nodeType === 'cdata') {
		return '';
	}

	const tagName = node.name?.toLowerCase();
	const children = node.children ?? [];

	if (!tagName) {
		return children.map(sanitizeNode).join('');
	}

	if (DROP_CONTENT_TAGS.has(tagName)) {
		return '';
	}

	if (!ALLOWED_TAGS.has(tagName)) {
		return children.map(sanitizeNode).join('');
	}

	const attributes = Object.entries(node.attribs ?? {})
		.map(([name, value]) => {
			const sanitizedValue = sanitizeAttribute(tagName, name, value);
			if (sanitizedValue === null) {
				return null;
			}

			if (BOOLEAN_ATTRIBUTES.has(name.toLowerCase())) {
				return sanitizedValue;
			}

			return `${name}="${escapeHtml(sanitizedValue)}"`;
		})
		.filter((attribute): attribute is string => attribute !== null);

	if (tagName === 'a' && !attributes.some((attribute) => attribute.startsWith('rel='))) {
		attributes.push('rel="noopener noreferrer"');
	}

	const serializedAttributes = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';

	if (VOID_TAGS.has(tagName)) {
		return `<${tagName}${serializedAttributes}>`;
	}

	return `<${tagName}${serializedAttributes}>${children.map(sanitizeNode).join('')}</${tagName}>`;
}

export function sanitizeHtml(html: string | null | undefined): string {
	if (!html) {
		return '';
	}

	const document = parseDocument(html);
	return (document.children as HtmlNode[]).map(sanitizeNode).join('');
}

export function toSafeHttpUrl(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return null;
		}

		return url.toString();
	} catch {
		return null;
	}
}
