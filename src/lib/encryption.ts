import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Encryption utility for API keys using AES-256-GCM
 *
 * The encryption key is derived from the ENCRYPTION_KEY environment variable
 * using scrypt for key derivation, providing additional security.
 *
 * AES-256-GCM is chosen because:
 * - Widely supported across all platforms (Node.js, Bun, browsers)
 * - Provides authenticated encryption (GCM mode)
 * - Industry standard for data encryption at rest
 * - Hardware acceleration available on most modern CPUs
 *
 * GRACEFUL DEGRADATION:
 * If ENCRYPTION_KEY is not set, the app will continue to work but store keys in plain text.
 * A warning will be logged on first use. This allows for smooth migration.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12; // 96 bits for GCM (recommended)
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag (GCM built-in)
const SALT_LENGTH = 32;
// Conservative scrypt params (N=16384, r=8, p=1) uses ~64MB memory
// This is secure for deriving from a high-entropy environment variable
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

// Encrypted format: VERSION (1 byte) | SALT (32 bytes) | IV (12 bytes) | ENCRYPTED_DATA | AUTH_TAG (16 bytes)
const VERSION = 0x01; // Version byte for future compatibility

let encryptionWarningShown = false;

/**
 * Check if encryption is properly configured
 */
export function isEncryptionEnabled(): boolean {
	const key = process.env.ENCRYPTION_KEY;
	return !!key && key.length >= 32;
}

export function assertEncryptionEnabled(): void {
	if (!process.env.ENCRYPTION_KEY) {
		throw new Error(
			'ENCRYPTION_KEY is required before storing API keys or other secrets. Set it and migrate existing keys if needed.'
		);
	}

	if (process.env.ENCRYPTION_KEY.length < 32) {
		throw new Error('ENCRYPTION_KEY must be at least 32 characters long.');
	}
}

/**
 * Derives a cryptographic key from the environment variable using scrypt
 */
function deriveKey(): Buffer {
	const encryptionKey = process.env.ENCRYPTION_KEY;

	if (!encryptionKey) {
		throw new Error(
			'ENCRYPTION_KEY environment variable is not set. Please set it to a secure random string.'
		);
	}

	if (encryptionKey.length < 32) {
		throw new Error('ENCRYPTION_KEY must be at least 32 characters long for security.');
	}

	// Use a static salt for key derivation from the environment variable
	// This is acceptable because we're deriving from a high-entropy environment variable
	const salt = Buffer.from('nanochat-api-key-encryption-salt', 'utf-8');

	return scryptSync(encryptionKey, salt, KEY_LENGTH, SCRYPT_PARAMS);
}

/**
 * Encrypts a plaintext API key
 * @param plaintext - The API key to encrypt
 * @returns Base64-encoded string, or plaintext if encryption is not enabled
 */
export function encryptApiKey(plaintext: string): string {
	if (!plaintext) {
		throw new Error('Cannot encrypt empty value');
	}

	// Graceful degradation: if encryption is not configured, return plaintext
	if (!isEncryptionEnabled()) {
		if (!encryptionWarningShown) {
			console.warn(
				'⚠️  ENCRYPTION_KEY not set. API keys will be stored in plain text. ' +
					'Set ENCRYPTION_KEY to enable encryption. See .env.example for details.'
			);
			encryptionWarningShown = true;
		}
		return plaintext;
	}

	const key = deriveKey();
	const iv = randomBytes(IV_LENGTH);
	const salt = randomBytes(SALT_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(plaintext, 'utf8');
	encrypted = Buffer.concat([encrypted, cipher.final()]);

	const authTag = cipher.getAuthTag();

	// Format: VERSION | SALT | IV | ENCRYPTED | AUTH_TAG
	const combined = Buffer.concat([Buffer.from([VERSION]), salt, iv, encrypted, authTag]);

	return combined.toString('base64');
}

/**
 * Decrypts an encrypted API key
 * @param ciphertext - Base64-encoded encrypted string
 * @returns The decrypted API key
 */
export function decryptApiKey(ciphertext: string): string {
	if (!ciphertext) {
		throw new Error('Cannot decrypt empty value');
	}

	const combined = Buffer.from(ciphertext, 'base64');

	// Minimum length check: VERSION (1) + SALT (32) + IV (12) + TAG (16) = 61 bytes
	if (combined.length < 61) {
		throw new Error('Invalid encrypted data: too short');
	}

	// Check version
	const version = combined[0];
	if (version !== VERSION) {
		throw new Error(`Unsupported encryption version: ${version}`);
	}

	let offset = 1;

	// Extract components (salt is stored but not used - kept for potential future use)
	offset += SALT_LENGTH; // Skip salt

	const iv = combined.subarray(offset, offset + IV_LENGTH);
	offset += IV_LENGTH;

	const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
	const encrypted = combined.subarray(offset, combined.length - AUTH_TAG_LENGTH);

	const key = deriveKey();

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(encrypted);
	decrypted = Buffer.concat([decrypted, decipher.final()]);

	return decrypted.toString('utf-8');
}

/**
 * Checks if a value appears to be encrypted
 * Heuristic: checks length, base64 encoding, and version byte
 */
export function isEncrypted(value: string): boolean {
	if (!value) return false;

	// Quick check: must be base64 and longer than typical API keys
	// Minimum encrypted size is ~88 chars base64 (61 bytes * 4/3)
	if (value.length < 80 || !/^[A-Za-z0-9+/=]+$/.test(value)) {
		return false;
	}

	// Try to parse and validate format
	try {
		const combined = Buffer.from(value, 'base64');

		// Check minimum length: VERSION (1) + SALT (32) + IV (12) + TAG (16) = 61
		if (combined.length < 61) {
			return false;
		}

		// Check for valid version byte
		const version = combined[0];
		return version === VERSION;
	} catch {
		return false;
	}
}
