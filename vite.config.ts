import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vitest/config';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
	plugins: [
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tailwindcss() as any,
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// Build-time canonical origin (CSRF self-origin + request.url). Unset → derived
			// from the host header plus PROTOCOL_HEADER/HOST_HEADER at runtime.
			paths: { origin: process.env.ORIGIN },
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		Icons({ compiler: 'svelte' }) as any,
	],
	server: {
		allowedHosts: isDev ? true : undefined,
	},
	ssr: {
		external: [],
	},
	test: {
		projects: [
			{
				extends: './vite.config.ts',
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				plugins: [svelteTesting() as any],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts'],
				},
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				},
			},
		],
	},
});
