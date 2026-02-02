import { env } from '$env/dynamic/private';

const DEFAULT_NANOGPT_BASE_URL = 'https://nano-gpt.com';

function normalizeBaseUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	if (!trimmed) {
		return DEFAULT_NANOGPT_BASE_URL;
	}

	return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function getNanoGPTBaseUrl(): string {
	return normalizeBaseUrl(env.NANOGPT_BASE_URL ?? DEFAULT_NANOGPT_BASE_URL);
}

export function nanoGptUrl(path: string): string {
	const baseUrl = getNanoGPTBaseUrl();
	if (!path) return baseUrl;

	return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}
