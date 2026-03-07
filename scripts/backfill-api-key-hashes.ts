#!/usr/bin/env bun

import 'dotenv/config';
import { accessSync, constants } from 'fs';
import { join } from 'path';
import { eq, sql } from 'drizzle-orm';
import { db, sqlite } from '../src/lib/db/index.js';
import { apiKeys } from '../src/lib/db/schema.js';
import {
	CURRENT_DEVELOPER_API_KEY_HASH_PREFIX,
	hashDeveloperApiKey,
	isCurrentDeveloperApiKeyHash,
} from '../src/lib/backend/api-key-hash.js';
import { decryptApiKey, isEncrypted } from '../src/lib/encryption.js';

type ApiKeyRecord = {
	id: string;
	name: string;
	key: string;
	keyHash: string | null;
};

function getStoredApiKeyValue(storedKey: string): string {
	return isEncrypted(storedKey) ? decryptApiKey(storedKey) : storedKey;
}

function isDryRun(): boolean {
	return process.argv.includes('--dry-run');
}

function assertDatabaseWritable(): void {
	const dbPath = join(process.cwd(), 'data', 'nanochat.db');
	const walPath = `${dbPath}-wal`;
	const shmPath = `${dbPath}-shm`;

	try {
		accessSync(dbPath, constants.R_OK | constants.W_OK);
	} catch {
		throw new Error(
			`Database is not writable at ${dbPath}. Check file ownership/permissions before running this script.`
		);
	}

	for (const path of [walPath, shmPath]) {
		try {
			accessSync(path, constants.F_OK);
		} catch {
			continue;
		}

		try {
			accessSync(path, constants.R_OK | constants.W_OK);
		} catch {
			throw new Error(
				`SQLite sidecar file is not writable at ${path}. Check file ownership/permissions before running this script.`
			);
		}
	}
}

async function getLegacyApiKeys(): Promise<ApiKeyRecord[]> {
	return db.query.apiKeys.findMany({
		where: sql`${apiKeys.keyHash} is null or ${apiKeys.keyHash} not like ${`${CURRENT_DEVELOPER_API_KEY_HASH_PREFIX}%`}`,
		columns: {
			id: true,
			name: true,
			key: true,
			keyHash: true,
		},
	});
}

async function main() {
	const dryRun = isDryRun();

	console.log('==================================================');
	console.log('  Developer API Key Hash Backfill');
	console.log('==================================================');
	console.log(dryRun ? '\nMode: dry run (no database writes)\n' : '');

	if (!dryRun) {
		assertDatabaseWritable();
	}

	const records = await getLegacyApiKeys();
	console.log(`Found ${records.length} API key(s) with missing or legacy lookup hashes.`);

	if (records.length === 0) {
		console.log('Nothing to backfill.');
		return;
	}

	let updatedCount = 0;
	let skippedCount = 0;
	let failedCount = 0;

	for (const record of records) {
		try {
			const plaintextKey = getStoredApiKeyValue(record.key);
			const nextHash = hashDeveloperApiKey(plaintextKey);

			if (isCurrentDeveloperApiKeyHash(record.keyHash) && record.keyHash === nextHash) {
				skippedCount++;
				console.log(`- Skipped ${record.id} (${record.name}): already current`);
				continue;
			}

			if (!dryRun) {
				await db.update(apiKeys).set({ keyHash: nextHash }).where(eq(apiKeys.id, record.id));
			}

			updatedCount++;
			console.log(`- ${dryRun ? 'Would update' : 'Updated'} ${record.id} (${record.name})`);
		} catch (error) {
			failedCount++;
			const message = error instanceof Error ? error.message : String(error);
			console.error(`- Failed ${record.id} (${record.name}): ${message}`);
		}
	}

	console.log('\nSummary:');
	console.log(`- ${dryRun ? 'Eligible for update' : 'Updated'}: ${updatedCount}`);
	console.log(`- Skipped: ${skippedCount}`);
	console.log(`- Failed: ${failedCount}`);

	if (failedCount > 0) {
		process.exitCode = 1;
	}
}

try {
	await main();
} finally {
	sqlite.close();
}
