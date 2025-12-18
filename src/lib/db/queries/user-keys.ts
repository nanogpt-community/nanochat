import { db, generateId } from '../index';
import { userKeys, type UserKey } from '../schema';
import { eq, and } from 'drizzle-orm';
import type { Provider } from '$lib/types';

export async function getAllUserKeys(
    userId: string
): Promise<Record<Provider, string | undefined>> {
    const allKeys = await db.query.userKeys.findMany({
        where: eq(userKeys.userId, userId),
    });

    const providers = ['nanogpt', 'huggingface', 'openai', 'anthropic'] as const;
    return providers.reduce(
        (acc, key) => {
            acc[key] = allKeys.find((item) => item.provider === key)?.key;
            return acc;
        },
        {} as Record<Provider, string | undefined>
    );
}

export async function getUserKey(userId: string, provider: string): Promise<string | null> {
    const result = await db.query.userKeys.findFirst({
        where: and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)),
    });
    return result?.key ?? null;
}

export async function setUserKey(userId: string, provider: string, key: string): Promise<UserKey> {
    const now = new Date();
    const existing = await db.query.userKeys.findFirst({
        where: and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)),
    });

    if (existing) {
        const [result] = await db
            .update(userKeys)
            .set({ key, updatedAt: now })
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
            key,
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
