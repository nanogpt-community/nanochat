import { db, generateId } from '../index';
import { userMemories, type UserMemory } from '../schema';
import { and, eq, asc, inArray } from 'drizzle-orm';

export const MAX_MEMORIES = 200;
export const MAX_MEMORY_LENGTH = 500;

function clean(content: string): string {
	return content.trim().slice(0, MAX_MEMORY_LENGTH);
}

export async function listUserMemories(userId: string): Promise<UserMemory[]> {
	return db.query.userMemories.findMany({
		where: eq(userMemories.userId, userId),
		orderBy: [asc(userMemories.createdAt)],
	});
}

export async function createUserMemory(userId: string, content: string): Promise<UserMemory> {
	const now = new Date();
	const [row] = await db
		.insert(userMemories)
		.values({ id: generateId(), userId, content: clean(content), createdAt: now, updatedAt: now })
		.returning();
	return row!;
}

export async function updateUserMemory(
	userId: string,
	id: string,
	content: string
): Promise<UserMemory | null> {
	const [row] = await db
		.update(userMemories)
		.set({ content: clean(content), updatedAt: new Date() })
		.where(and(eq(userMemories.id, id), eq(userMemories.userId, userId)))
		.returning();
	return row ?? null;
}

export async function deleteUserMemory(userId: string, id: string): Promise<void> {
	await db
		.delete(userMemories)
		.where(and(eq(userMemories.id, id), eq(userMemories.userId, userId)));
}

export async function deleteAllUserMemories(userId: string): Promise<void> {
	await db.delete(userMemories).where(eq(userMemories.userId, userId));
}

export type MemoryOps = {
	add: string[];
	update: { id: string; content: string }[];
	delete: string[];
};

/** Apply an extraction result. Ids that don't belong to the user are ignored. */
export async function applyMemoryOps(userId: string, ops: MemoryOps): Promise<void> {
	if (ops.delete.length > 0) {
		await db
			.delete(userMemories)
			.where(and(eq(userMemories.userId, userId), inArray(userMemories.id, ops.delete)));
	}
	for (const u of ops.update) {
		if (u.content.trim()) await updateUserMemory(userId, u.id, u.content);
	}
	const adds = ops.add.map(clean).filter(Boolean);
	if (adds.length > 0) {
		const existing = await listUserMemories(userId);
		const room = Math.max(0, MAX_MEMORIES - existing.length);
		const now = new Date();
		const values = adds.slice(0, room).map((content) => ({
			id: generateId(),
			userId,
			content,
			createdAt: now,
			updatedAt: now,
		}));
		if (values.length > 0) await db.insert(userMemories).values(values);
	}
}
