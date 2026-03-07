import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, generateId } from '$lib/db';
import { apiKeys } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod/v4';
import { randomUUID } from 'crypto';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { encryptApiKey } from '$lib/encryption';
import { assertSecureSecretStorageReady, hashDeveloperApiKey } from '$lib/backend/api-key-security';
import { jsonNoStore } from '$lib/backend/http-security';

// GET - List API keys (excluding the actual key value for security)
export const GET: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);

	const keys = await db.query.apiKeys.findMany({
		where: eq(apiKeys.userId, userId),
		columns: {
			id: true,
			name: true,
			lastUsedAt: true,
			createdAt: true,
			// Exclude 'key' for security - never expose after creation
		},
	});

	return jsonNoStore({ keys });
};

// POST - Create new API key
const createSchema = z.object({
	name: z.string().min(1).max(100),
});

export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);

	const body = await request.json();
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return error(400, 'Invalid request body');
	}

	try {
		assertSecureSecretStorageReady();
	} catch (e) {
		return error(503, e instanceof Error ? e.message : 'Secure secret storage is not configured');
	}

	const keyId = generateId();
	const keyValue = `nc_${randomUUID().replace(/-/g, '')}`;
	const now = new Date();

	// Encrypt the key before storing
	const encryptedKey = encryptApiKey(keyValue);

	await db.insert(apiKeys).values({
		id: keyId,
		userId: userId,
		key: encryptedKey,
		keyHash: hashDeveloperApiKey(keyValue),
		name: parsed.data.name,
		createdAt: now,
	});

	// Return the key value ONLY on creation (unencrypted)
	return jsonNoStore({
		id: keyId,
		key: keyValue,
		name: parsed.data.name,
		createdAt: now,
	});
};

// DELETE - Revoke API key
const deleteSchema = z.object({
	id: z.string(),
});

export const DELETE: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);

	const body = await request.json();
	const parsed = deleteSchema.safeParse(body);
	if (!parsed.success) {
		return error(400, 'Invalid request body');
	}

	// Ensure user owns this key
	const key = await db.query.apiKeys.findFirst({
		where: and(eq(apiKeys.id, parsed.data.id), eq(apiKeys.userId, userId)),
	});

	if (!key) {
		return error(404, 'API key not found');
	}

	await db.delete(apiKeys).where(eq(apiKeys.id, parsed.data.id));

	return jsonNoStore({ success: true });
};
