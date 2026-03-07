import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'base-uri': ['self'],
				'frame-ancestors': ['none'],
				'object-src': ['none'],
				'script-src': ['self', 'unsafe-eval', 'https://static.cloudflareinsights.com'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'https:', 'blob:'],
				'font-src': ['self', 'data:'],
				'media-src': ['self', 'https:', 'blob:'],
				'connect-src': [
					'self',
					'https:',
					'ws:',
					'wss:',
					'https://cloudflareinsights.com',
					'https://static.cloudflareinsights.com',
				],
				'frame-src': ['self'],
				'form-action': ['self'],
			},
		},
	},
};

export default config;
