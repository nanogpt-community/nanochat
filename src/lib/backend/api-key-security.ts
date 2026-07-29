import { assertEncryptionEnabled } from '$lib/encryption';
export {
	apiKeysEqual,
	CURRENT_DEVELOPER_API_KEY_HASH_PREFIX,
	hashDeveloperApiKey,
	isCurrentDeveloperApiKeyHash,
} from '$lib/backend/api-key-hash';

// ponytail: api_keys.key_hash is created by the initial migration, so the old
// PRAGMA table_info() feature-detect is gone. Nothing to probe.
export function assertSecureSecretStorageReady(): void {
	assertEncryptionEnabled();
}
