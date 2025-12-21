import { db, generateId } from '$lib/db';
import { assistants } from '$lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { Assistant, NewAssistant } from '$lib/db/types';

export async function getAllAssistants(userId: string) {
    return await db.query.assistants.findMany({
        where: eq(assistants.userId, userId),
        orderBy: [desc(assistants.createdAt)],
    });
}

export async function getAssistantById(userId: string, assistantId: string) {
    return await db.query.assistants.findFirst({
        where: and(eq(assistants.id, assistantId), eq(assistants.userId, userId)),
    });
}

export async function createAssistant(
    userId: string,
    data: Omit<NewAssistant, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
) {
    const now = new Date();
    const [newAssistant] = await db
        .insert(assistants)
        .values({
            id: generateId(),
            userId,
            ...data,
            createdAt: now,
            updatedAt: now,
        })
        .returning();
    return newAssistant;
}

export async function updateAssistant(
    userId: string,
    assistantId: string,
    data: Partial<Omit<NewAssistant, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
) {
    const [updatedAssistant] = await db
        .update(assistants)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(and(eq(assistants.id, assistantId), eq(assistants.userId, userId)))
        .returning();
    return updatedAssistant;
}

export async function deleteAssistant(userId: string, assistantId: string) {
    await db
        .delete(assistants)
        .where(and(eq(assistants.id, assistantId), eq(assistants.userId, userId)));
}
