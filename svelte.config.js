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
				'script-src': [
					'self',
					'unsafe-eval',
					'https://static.cloudflareinsights.com',
					// mode-watcher renders its anti-theme-flash script into the SSR'd body,
					// so SvelteKit never sees it and can't nonce it. Without this hash the
					// browser blocks it and dark-mode users get a flash of light theme.
					// If mode-watcher or its <ModeWatcher> props change, the console prints
					// the new hash — paste it here.
					'sha256-GspMsYJ6I1ZsBkU7qrFZAHTXo2vIWWKLfs68AaOQhYM=',
				],
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
