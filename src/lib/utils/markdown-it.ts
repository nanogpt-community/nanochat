import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async';
import { h } from 'hastscript';
import MarkdownItAsync from 'markdown-it-async';
import { codeToHtml } from 'shiki';
import { sanitizeHtml } from './html-sanitizer';

const md = MarkdownItAsync({
	linkify: true,
});

md.use(
	fromAsyncCodeToHtml(
		// Pass the codeToHtml function
		codeToHtml,
		{
			themes: {
				light: 'github-light-default',
				dark: 'github-dark-default',
			},
			transformers: [
				{
					name: 'shiki-transformer-copy-button',
					pre(node) {
						const copyIcon = h(
							'svg',
							{
								width: '24',
								height: '24',
								viewBox: '0 0 24 24',
								fill: 'none',
								stroke: 'currentColor',
								'stroke-width': '2',
								'stroke-linecap': 'round',
								'stroke-linejoin': 'round',
							},
							[
								h('rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }),
								h('path', {
									d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
								}),
							]
						);

						const checkIcon = h(
							'svg',
							{
								width: '24',
								height: '24',
								viewBox: '0 0 24 24',
								fill: 'none',
								stroke: 'currentColor',
								'stroke-width': '2',
								'stroke-linecap': 'round',
								'stroke-linejoin': 'round',
							},
							[h('path', { d: 'M20 6 9 17l-5-5' })]
						);

						const button = h(
							'button',
							{
								class: 'copy',
								type: 'button',
								'data-code': this.source,
								'data-copy-button': 'true',
							},
							[
								h('span', { class: 'ready', style: 'background-color: transparent !important;' }, [
									copyIcon,
								]),
								h(
									'span',
									{ class: 'success', style: 'background-color: transparent !important;' },
									[checkIcon]
								),
							]
						);

						node.children.push(button);
					},
				},
			],
		}
	)
);

// Make external links open in new tab
const defaultLinkOpen =
	md.renderer.rules.link_open ||
	function (tokens: any[], idx: number, options: any, _env: any, self: any) {
		return self.renderToken(tokens, idx, options);
	};

md.renderer.rules.link_open = function (
	tokens: any[],
	idx: number,
	options: any,
	env: any,
	self: any
) {
	const href = tokens[idx].attrGet('href');
	if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
		tokens[idx].attrPush(['target', '_blank']);
		tokens[idx].attrPush(['rel', 'noopener noreferrer']);
	}
	return defaultLinkOpen(tokens, idx, options, env, self);
};

export { md, sanitizeHtml };
