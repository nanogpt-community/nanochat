import { createHmac, timingSafeEqual } from 'crypto';
import { sqlite } from '$lib/db';
import { assertEncryptionEnabled } from '$lib/encryption';

let apiKeyHashColumnAvailable: boolean | undefined;

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
	return createHmac('sha256', getApiKeyHashSecret()).update(apiKey).digest('hex');
}

export function developerApiKeysUseHashedLookup(): boolean {
	if (apiKeyHashColumnAvailable !== undefined) {
		return apiKeyHashColumnAvailable;
	}

	const columns = sqlite.prepare('PRAGMA table_info(api_keys)').all() as Array<{ name: string }>;
	apiKeyHashColumnAvailable = columns.some((column) => column.name === 'key_hash');
	return apiKeyHashColumnAvailable;
}

export function assertSecureSecretStorageReady(): void {
	assertEncryptionEnabled();

	if (!developerApiKeysUseHashedLookup()) {
		throw new Error(
			'Database schema is missing api_keys.key_hash. Run `npx drizzle-kit push` before creating new API keys.'
		);
	}
}

export function apiKeysEqual(expected: string, actual: string): boolean {
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const actualBuffer = Buffer.from(actual, 'utf8');

	if (expectedBuffer.length !== actualBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, actualBuffer);
}
