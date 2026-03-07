/**
 * Shared authentication utilities for API endpoints.
 * Supports both session cookie and API key (Bearer token) authentication.
 */

import { error } from '@sveltejs/kit';
import { Result, ok, err } from 'neverthrow';
import { db } from '$lib/db';
import { apiKeys } from '$lib/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { auth } from '$lib/auth';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import {
	apiKeysEqual,
	developerApiKeysUseHashedLookup,
	hashDeveloperApiKey,
} from '$lib/backend/api-key-security';

function getStoredApiKeyValue(storedKey: string): string {
	return isEncrypted(storedKey) ? decryptApiKey(storedKey) : storedKey;
}

async function backfillMissingApiKeyHashes(): Promise<void> {
	if (!developerApiKeysUseHashedLookup()) {
		return;
	}

	const unhashedKeys = await db.query.apiKeys.findMany({
		where: isNull(apiKeys.keyHash),
		columns: {
			id: true,
			key: true,
		},
	});

	for (const record of unhashedKeys) {
		try {
			const plaintextKey = getStoredApiKeyValue(record.key);
			await db
				.update(apiKeys)
				.set({ keyHash: hashDeveloperApiKey(plaintextKey) })
				.where(eq(apiKeys.id, record.id));
		} catch {
			// Skip corrupted legacy rows so one bad record does not block all API key auth.
			continue;
		}
	}
}

/**
 * Get user ID from API key (Bearer token).
 * Validates the API key and returns the associated user ID.
 *
 * @param authHeader - The Authorization header value
 * @returns Result with userId on success, error message on failure
 */
export async function getUserIdFromApiKey(
	authHeader: string | null
): Promise<Result<string, string>> {
	if (!authHeader) {
		return err('Missing Authorization header. Use: Authorization: Bearer <your_api_key>');
	}

	if (!authHeader.startsWith('Bearer ')) {
		return err('Invalid Authorization header format. Expected: Bearer <your_api_key>');
	}

	const keyValue = authHeader.slice(7); // Remove 'Bearer ' prefix

	if (!keyValue) {
		return err('Empty API key. Provide your key after "Bearer "');
	}

	if (!keyValue.startsWith('nc_')) {
		return err(
			'Invalid API key format. Keys should start with "nc_". Generate one at /account/developer'
		);
	}

	try {
		let apiKeyRecord:
			| {
					id: string;
					userId: string;
					key: string;
					keyHash: string | null;
			  }
			| undefined;

		if (developerApiKeysUseHashedLookup()) {
			const keyHash = hashDeveloperApiKey(keyValue);

			apiKeyRecord = await db.query.apiKeys.findFirst({
				where: eq(apiKeys.keyHash, keyHash),
				columns: {
					id: true,
					userId: true,
					key: true,
					keyHash: true,
				},
			});

			if (!apiKeyRecord) {
				await backfillMissingApiKeyHashes();
				apiKeyRecord = await db.query.apiKeys.findFirst({
					where: eq(apiKeys.keyHash, keyHash),
					columns: {
						id: true,
						userId: true,
						key: true,
						keyHash: true,
					},
				});
			}
		} else {
			const allApiKeys = await db.query.apiKeys.findMany({
				columns: {
					id: true,
					userId: true,
					key: true,
					keyHash: true,
				},
			});

			apiKeyRecord = allApiKeys.find((record) => {
				try {
					return apiKeysEqual(getStoredApiKeyValue(record.key), keyValue);
				} catch {
					return false;
				}
			});
		}

		if (!apiKeyRecord) {
			return err('API key not found or has been revoked. Generate a new key at /account/developer');
		}

		const storedKeyValue = getStoredApiKeyValue(apiKeyRecord.key);
		if (!apiKeysEqual(storedKeyValue, keyValue)) {
			return err('API key not found or has been revoked. Generate a new key at /account/developer');
		}

		if (developerApiKeysUseHashedLookup() && !apiKeyRecord.keyHash) {
			await db
				.update(apiKeys)
				.set({ keyHash: hashDeveloperApiKey(storedKeyValue) })
				.where(eq(apiKeys.id, apiKeyRecord.id));
		}

		// Update lastUsedAt timestamp
		await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyRecord.id));

		return ok(apiKeyRecord.userId);
	} catch (e) {
		return err('Internal error validating API key. Please try again or contact support.');
	}
}

/**
 * Get authenticated user ID from request.
 * Tries API key authentication first, then falls back to session cookie.
 *
 * @param request - The incoming request
 * @returns The authenticated user ID
 * @throws 401 error if no valid authentication is found
 */
export async function getAuthenticatedUserId(request: Request): Promise<string> {
	const authHeader = request.headers.get('Authorization');

	// Try API key auth first (Bearer token)
	if (authHeader?.startsWith('Bearer nc_')) {
		const userIdResult = await getUserIdFromApiKey(authHeader);
		if (userIdResult.isErr()) {
			throw error(401, userIdResult.error);
		}
		return userIdResult.value;
	}

	// Fall back to cookie-based session authentication
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		throw error(401, 'Authentication required: provide Bearer token or session cookie');
	}
	return session.user.id;
}

/**
 * Try to get authenticated user ID, but don't throw if not authenticated.
 * Useful for endpoints that have optional authentication or public fallbacks.
 *
 * @param request - The incoming request
 * @returns The authenticated user ID or undefined if not authenticated
 */
export async function tryGetAuthenticatedUserId(request: Request): Promise<string | undefined> {
	const authHeader = request.headers.get('Authorization');

	// Try API key auth first (Bearer token)
	if (authHeader?.startsWith('Bearer nc_')) {
		const userIdResult = await getUserIdFromApiKey(authHeader);
		if (userIdResult.isOk()) {
			return userIdResult.value;
		}
		return undefined;
	}

	// Fall back to cookie-based session authentication
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		return session?.user?.id;
	} catch {
		return undefined;
	}
}
