import { pbkdf2Sync, timingSafeEqual } from 'crypto';

const API_KEY_HASH_VERSION = 'v2';
export const CURRENT_DEVELOPER_API_KEY_HASH_PREFIX = `${API_KEY_HASH_VERSION}:`;
const API_KEY_HASH_ITERATIONS = 120_000;
const API_KEY_HASH_LENGTH = 32;
const API_KEY_HASH_DIGEST = 'sha256';

function getApiKeyHashSecret(): string {
	const secret =
		process.env.API_KEY_HASH_SECRET ?? process.env.ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;

	if (!secret || secret.length < 32) {
		throw new Error(
			'API key hashing requires API_KEY_HASH_SECRET, ENCRYPTION_KEY, or BETTER_AUTH_SECRET with at least 32 characters.'
		);
	}

	return secret;
}

export function hashDeveloperApiKey(apiKey: string): string {
	const lookupHash = pbkdf2Sync(
		apiKey,
		`nanochat:developer-api-key:${getApiKeyHashSecret()}`,
		API_KEY_HASH_ITERATIONS,
		API_KEY_HASH_LENGTH,
		API_KEY_HASH_DIGEST
	).toString('hex');

	return `${CURRENT_DEVELOPER_API_KEY_HASH_PREFIX}${lookupHash}`;
}

export function isCurrentDeveloperApiKeyHash(keyHash: string | null | undefined): boolean {
	return !!keyHash && keyHash.startsWith(CURRENT_DEVELOPER_API_KEY_HASH_PREFIX);
}

export function apiKeysEqual(expected: string, actual: string): boolean {
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const actualBuffer = Buffer.from(actual, 'utf8');

	if (expectedBuffer.length !== actualBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, actualBuffer);
}
