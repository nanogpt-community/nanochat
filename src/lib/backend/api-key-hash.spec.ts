import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashDeveloperApiKey } from './api-key-hash';

const KEY = 'nc_0123456789abcdef0123456789abcdef';
const saved = { ...process.env };

describe('hashDeveloperApiKey secret fallback', () => {
	beforeEach(() => {
		delete process.env.API_KEY_HASH_SECRET;
		delete process.env.ENCRYPTION_KEY;
		delete process.env.BETTER_AUTH_SECRET;
	});
	afterEach(() => {
		process.env = { ...saved };
	});

	it('treats an empty API_KEY_HASH_SECRET from .env as unset', () => {
		// .env.example ships `API_KEY_HASH_SECRET=`; that must not shadow ENCRYPTION_KEY.
		process.env.API_KEY_HASH_SECRET = '';
		process.env.ENCRYPTION_KEY = 'e'.repeat(32);
		expect(hashDeveloperApiKey(KEY)).toMatch(/^v3:[0-9a-f]{64}$/);
	});

	it('throws when every candidate is empty', () => {
		process.env.API_KEY_HASH_SECRET = '';
		process.env.ENCRYPTION_KEY = '';
		process.env.BETTER_AUTH_SECRET = '';
		expect(() => hashDeveloperApiKey(KEY)).toThrow(/at least 32 characters/);
	});
});
