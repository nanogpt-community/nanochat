import { sqlite } from '$lib/db';
import { assertEncryptionEnabled } from '$lib/encryption';
export {
	apiKeysEqual,
	CURRENT_DEVELOPER_API_KEY_HASH_PREFIX,
	hashDeveloperApiKey,
	isCurrentDeveloperApiKeyHash,
} from '$lib/backend/api-key-hash';

let apiKeyHashColumnAvailable: boolean | undefined;

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
