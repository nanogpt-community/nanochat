import { db, generateId } from '../index';
import { userSettings, type UserSettings, type NewUserSettings } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
	const result = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
	});
	return result ?? null;
}

export async function createUserSettings(
	userId: string,
	data?: Partial<Omit<NewUserSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<UserSettings> {
	const now = new Date();
	const [result] = await db
		.insert(userSettings)
		.values({
			id: generateId(),
			userId,
			privacyMode: data?.privacyMode ?? false,
			contextMemoryEnabled: data?.contextMemoryEnabled ?? false,
			persistentMemoryEnabled: data?.persistentMemoryEnabled ?? false,
			youtubeTranscriptsEnabled: data?.youtubeTranscriptsEnabled ?? false,
			followUpQuestionsEnabled: data?.followUpQuestionsEnabled ?? true,
			freeMessagesUsed: data?.freeMessagesUsed ?? 0,
			karakeepUrl: data?.karakeepUrl ?? null,
			karakeepApiKey: data?.karakeepApiKey ?? null,
			theme: data?.theme ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	return result!;
}

export async function updateUserSettings(
	userId: string,
	data: Partial<Omit<NewUserSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<UserSettings | null> {
	const [result] = await db
		.update(userSettings)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(userSettings.userId, userId))
		.returning();
	return result ?? null;
}

export async function incrementFreeMessageCount(userId: string): Promise<void> {
	const settings = await getUserSettings(userId);

	if (!settings) {
		await createUserSettings(userId, { freeMessagesUsed: 1 });
	} else {
		await db
			.update(userSettings)
			.set({
				freeMessagesUsed: (settings.freeMessagesUsed ?? 0) + 1,
				updatedAt: new Date(),
			})
			.where(eq(userSettings.userId, userId));
	}
}

export async function getOrCreateUserSettings(userId: string): Promise<UserSettings> {
	const existing = await getUserSettings(userId);
	if (existing) return existing;
	return createUserSettings(userId);
}
