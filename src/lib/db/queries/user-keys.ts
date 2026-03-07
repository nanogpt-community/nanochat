import { db, generateId } from '../index';
import { userKeys, type UserKey } from '../schema';
import { eq, and } from 'drizzle-orm';
import type { Provider } from '$lib/types';
import { encryptApiKey, decryptApiKey, isEncrypted } from '$lib/encryption';

export type UserKeyStatus = {
	hasKey: boolean;
	source: 'user' | 'server' | null;
};

const providers = ['nanogpt', 'huggingface', 'openai', 'anthropic'] as const;

function resolveUserKeyStatus(provider: string, hasUserKey: boolean): UserKeyStatus {
	if (hasUserKey) {
		return { hasKey: true, source: 'user' };
	}

	if (provider === 'nanogpt' && process.env.NANOGPT_API_KEY) {
		return { hasKey: true, source: 'server' };
	}

	return { hasKey: false, source: null };
}

export async function getAllUserKeys(
    userId: string
): Promise<Record<Provider, string | undefined>> {
    const allKeys = await db.query.userKeys.findMany({
        where: eq(userKeys.userId, userId),
    });

    return providers.reduce(
        (acc, key) => {
            acc[key] = allKeys.find((item) => item.provider === key)?.key;
            return acc;
        },
        {} as Record<Provider, string | undefined>
    );
}

export async function getAllUserKeyStatuses(userId: string): Promise<Record<Provider, UserKeyStatus>> {
	const allKeys = await db.query.userKeys.findMany({
		where: eq(userKeys.userId, userId),
		columns: {
			provider: true,
			key: true,
		},
	});

	return providers.reduce(
		(acc, provider) => {
			const hasUserKey = Boolean(allKeys.find((item) => item.provider === provider)?.key);
			acc[provider] = resolveUserKeyStatus(provider, hasUserKey);
			return acc;
		},
		{} as Record<Provider, UserKeyStatus>
	);
}

export async function getUserKeyStatus(userId: string, provider: string): Promise<UserKeyStatus> {
	const result = await db.query.userKeys.findFirst({
		where: and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)),
		columns: {
			key: true,
		},
	});

	return resolveUserKeyStatus(provider, Boolean(result?.key));
}

export async function getUserKey(userId: string, provider: string): Promise<string | null> {
    const result = await db.query.userKeys.findFirst({
        where: and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)),
    });

    if (!result?.key) return null;

    // Decrypt the key if it's encrypted
    if (isEncrypted(result.key)) {
        return decryptApiKey(result.key);
    }

    // Return as-is if not encrypted (legacy support)
    return result.key;
}

export async function setUserKey(userId: string, provider: string, key: string): Promise<UserKey> {
    const now = new Date();
    const existing = await db.query.userKeys.findFirst({
        where: and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)),
    });

    // Encrypt the key before storing
    const encryptedKey = encryptApiKey(key);

    if (existing) {
        const [result] = await db
            .update(userKeys)
            .set({ key: encryptedKey, updatedAt: now })
            .where(eq(userKeys.id, existing.id))
            .returning();

        if (!result) throw new Error('Failed to update key');
        return result;
    }

    const [result] = await db
        .insert(userKeys)
        .values({
            id: generateId(),
            userId,
            provider,
            key: encryptedKey,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    if (!result) throw new Error('Failed to create key');
    return result;
}

export async function deleteUserKey(userId: string, provider: string): Promise<boolean> {
    const [deleted] = await db
        .delete(userKeys)
        .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)))
        .returning({ id: userKeys.id });
    return !!deleted;
}
