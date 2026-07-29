import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey, isEncrypted, isEncryptionEnabled } from './encryption';

const SECRET_A = 'test-encryption-key-at-least-32chars-long';
const SECRET_B = 'a-completely-different-key-32-chars-min!!';
const ORIGINAL = process.env.ENCRYPTION_KEY;

describe('API key encryption', () => {
	beforeEach(() => {
		process.env.ENCRYPTION_KEY = SECRET_A;
	});

	afterEach(() => {
		if (ORIGINAL === undefined) delete process.env.ENCRYPTION_KEY;
		else process.env.ENCRYPTION_KEY = ORIGINAL;
	});

	it('round trips a value', () => {
		expect(decryptApiKey(encryptApiKey('sk-live-abcdef1234567890'))).toBe(
			'sk-live-abcdef1234567890'
		);
	});

	it('round trips unicode and long values', () => {
		const value = `sk-🔑-ünïcødé-${'x'.repeat(500)}`;
		expect(decryptApiKey(encryptApiKey(value))).toBe(value);
	});

	it('produces a different ciphertext each time', () => {
		// A fresh IV per message is what GCM's security depends on; reusing one under
		// the same key is catastrophic, so this guards against a "cache the IV too"
		// style optimisation being added alongside the key cache.
		expect(encryptApiKey('same-input')).not.toBe(encryptApiKey('same-input'));
	});

	it('rejects tampered ciphertext', () => {
		const buffer = Buffer.from(encryptApiKey('sk-live-abcdef1234567890'), 'base64');
		const target = buffer.length - 20;
		buffer[target] = (buffer[target] ?? 0) ^ 0xff;

		expect(() => decryptApiKey(buffer.toString('base64'))).toThrow();
	});

	it('re-derives when the secret changes rather than serving a cached key', () => {
		// The derived key is memoised for speed. Keyed on the secret, so rotating
		// ENCRYPTION_KEY must invalidate it — otherwise a rotated deployment would
		// keep silently using the old key.
		const underA = encryptApiKey('sk-live-abcdef1234567890');

		process.env.ENCRYPTION_KEY = SECRET_B;
		expect(() => decryptApiKey(underA)).toThrow();
		expect(decryptApiKey(encryptApiKey('via-b'))).toBe('via-b');

		process.env.ENCRYPTION_KEY = SECRET_A;
		expect(decryptApiKey(underA)).toBe('sk-live-abcdef1234567890');
	});

	it('recognises its own output and not plaintext keys', () => {
		expect(isEncrypted(encryptApiKey('sk-live-abcdef1234567890'))).toBe(true);
		expect(isEncrypted('sk-live-abcdef1234567890')).toBe(false);
		expect(isEncrypted('')).toBe(false);
	});

	it('reports encryption disabled for a missing or too-short key', () => {
		process.env.ENCRYPTION_KEY = 'too-short';
		expect(isEncryptionEnabled()).toBe(false);

		delete process.env.ENCRYPTION_KEY;
		expect(isEncryptionEnabled()).toBe(false);
	});
});
