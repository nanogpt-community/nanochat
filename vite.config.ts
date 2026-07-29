import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vitest/config';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	plugins: [tailwindcss() as any, sveltekit() as any, Icons({ compiler: 'svelte' }) as any],
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
