import { afterEach, describe, expect, it } from 'vitest';
import {
	apiKeysEqual,
	hashDeveloperApiKey,
	isCurrentDeveloperApiKeyHash,
} from './api-key-hash';

const ORIGINAL_API_KEY_HASH_SECRET = process.env.API_KEY_HASH_SECRET;

describe('api-key-security', () => {
	afterEach(() => {
		if (ORIGINAL_API_KEY_HASH_SECRET === undefined) {
			delete process.env.API_KEY_HASH_SECRET;
			return;
		}

		process.env.API_KEY_HASH_SECRET = ORIGINAL_API_KEY_HASH_SECRET;
	});

	it('derives a deterministic PBKDF2 lookup hash for API keys', () => {
		process.env.API_KEY_HASH_SECRET = '0123456789abcdef0123456789abcdef';

		const first = hashDeveloperApiKey('nc_test_api_key_value');
		const second = hashDeveloperApiKey('nc_test_api_key_value');

		expect(first).toBe(second);
		expect(first).toMatch(/^v2:[0-9a-f]{64}$/);
		expect(isCurrentDeveloperApiKeyHash(first)).toBe(true);
	});

	it('changes the lookup hash when the secret changes', () => {
		process.env.API_KEY_HASH_SECRET = '0123456789abcdef0123456789abcdef';
		const first = hashDeveloperApiKey('nc_test_api_key_value');

		process.env.API_KEY_HASH_SECRET = 'fedcba9876543210fedcba9876543210';
		const second = hashDeveloperApiKey('nc_test_api_key_value');

		expect(first).not.toBe(second);
	});

	it('compares API key values in constant-time when lengths match', () => {
		expect(apiKeysEqual('nc_same_value', 'nc_same_value')).toBe(true);
		expect(apiKeysEqual('nc_same_value', 'nc_other_value')).toBe(false);
		expect(apiKeysEqual('short', 'longer')).toBe(false);
	});
});
