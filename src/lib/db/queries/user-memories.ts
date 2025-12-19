import { db, generateId } from '../index';
import { userMemories, type UserMemory, type NewUserMemory } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUserMemory(userId: string): Promise<UserMemory | null> {
    const result = await db.query.userMemories.findFirst({
        where: eq(userMemories.userId, userId),
    });
    return result ?? null;
}

export async function upsertUserMemory(
    userId: string,
    content: string,
    tokenCount?: number
): Promise<UserMemory> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const existing = await getUserMemory(userId);

    if (existing) {
        const [result] = await db
            .update(userMemories)
            .set({
                content,
                tokenCount,
                expiresAt,
                updatedAt: now,
            })
            .where(eq(userMemories.userId, userId))
            .returning();
        return result;
    }

    const [result] = await db
        .insert(userMemories)
        .values({
            id: generateId(),
            userId,
            content,
            tokenCount,
            expiresAt,
            createdAt: now,
            updatedAt: now,
        })
        .returning();
    return result;
}

export async function deleteUserMemory(userId: string): Promise<void> {
    await db.delete(userMemories).where(eq(userMemories.userId, userId));
}
