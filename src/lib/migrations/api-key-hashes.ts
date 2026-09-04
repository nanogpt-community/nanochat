import { db } from '$lib/db';
import { apiKeys } from '$lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import {
	CURRENT_DEVELOPER_API_KEY_HASH_PREFIX,
	hashDeveloperApiKey,
} from '$lib/backend/api-key-security';
import { decryptApiKey, isEncrypted } from '$lib/encryption';

/**
 * Rewrites developer key lookup hashes to the current scheme on startup, so the
 * expensive legacy lookup path retires itself after one boot of the new image.
 * Idempotent; safe to run every start.
 */
export async function migrateApiKeyHashes(): Promise<void> {
	try {
		const legacy = await db.query.apiKeys.findMany({
			where: sql`${apiKeys.keyHash} is null or ${apiKeys.keyHash} not like ${`${CURRENT_DEVELOPER_API_KEY_HASH_PREFIX}%`}`,
			columns: { id: true, key: true },
		});
		if (legacy.length === 0) return;

		let updated = 0;
		for (const record of legacy) {
			try {
				const plaintext = isEncrypted(record.key) ? decryptApiKey(record.key) : record.key;
				await db
					.update(apiKeys)
					.set({ keyHash: hashDeveloperApiKey(plaintext) })
					.where(eq(apiKeys.id, record.id));
				updated++;
			} catch (e) {
				// Undecryptable row (encryption key changed): it still works via the
				// legacy lookup and gets upgraded on its next successful use.
				console.warn(`[api-key-hashes] Skipped ${record.id}: ${e instanceof Error ? e.message : e}`);
			}
		}
		console.log(`[api-key-hashes] Upgraded ${updated}/${legacy.length} developer key hash(es).`);
	} catch (e) {
		console.error('[api-key-hashes] Migration failed:', e);
	}
}
