import { createHmac, pbkdf2Sync, timingSafeEqual } from 'crypto';

/**
 * Developer keys are `nc_` + 128 random bits, so a keyed digest is enough to make
 * the stored value useless to a database reader; key stretching only made every
 * *invalid* key cost ~10ms of blocked event loop before any lookup happened.
 */
const API_KEY_HASH_VERSION = 'v3';
export const CURRENT_DEVELOPER_API_KEY_HASH_PREFIX = `${API_KEY_HASH_VERSION}:`;
export const LEGACY_DEVELOPER_API_KEY_HASH_PREFIX = 'v2:';
const LEGACY_HASH_ITERATIONS = 120_000;
const LEGACY_HASH_LENGTH = 32;

/** Exact shape produced by the key generator; anything else is rejected before hashing. */
export const DEVELOPER_API_KEY_PATTERN = /^nc_[0-9a-f]{32}$/;

function getApiKeyHashSecret(): string {
	const secret =
		process.env.API_KEY_HASH_SECRET || process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;

	if (!secret || secret.length < 32) {
		throw new Error(
			'API key hashing requires API_KEY_HASH_SECRET, ENCRYPTION_KEY, or BETTER_AUTH_SECRET with at least 32 characters.'
		);
	}

	return secret;
}

export function hashDeveloperApiKey(apiKey: string): string {
	const digest = createHmac('sha256', `nanochat:developer-api-key:${getApiKeyHashSecret()}`)
		.update(apiKey)
		.digest('hex');
	return `${CURRENT_DEVELOPER_API_KEY_HASH_PREFIX}${digest}`;
}

/** The previous PBKDF2 form, kept only to find rows the backfill script hasn't rewritten yet. */
export function legacyHashDeveloperApiKey(apiKey: string): string {
	const lookupHash = pbkdf2Sync(
		apiKey,
		`nanochat:developer-api-key:${getApiKeyHashSecret()}`,
		LEGACY_HASH_ITERATIONS,
		LEGACY_HASH_LENGTH,
		'sha256'
	).toString('hex');
	return `${LEGACY_DEVELOPER_API_KEY_HASH_PREFIX}${lookupHash}`;
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
