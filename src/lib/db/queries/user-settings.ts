import { db, generateId } from '../index';
import { userSettings, type UserSettings, type NewUserSettings } from '../schema';
import { eq } from 'drizzle-orm';
import {
	assertEncryptionEnabled,
	decryptApiKey,
	encryptApiKey,
	isEncrypted,
} from '$lib/encryption';

type UserSettingsUpdate = Partial<
	Omit<NewUserSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

export type PublicUserSettings = Omit<UserSettings, 'karakeepApiKey'> & {
	hasKarakeepApiKey: boolean;
};

function decryptUserSettingsSecrets(settings: UserSettings): UserSettings {
	if (!settings.karakeepApiKey) {
		return settings;
	}

	return {
		...settings,
		karakeepApiKey: isEncrypted(settings.karakeepApiKey)
			? decryptApiKey(settings.karakeepApiKey)
			: settings.karakeepApiKey,
	};
}

function prepareUserSettingsWrite(data: UserSettingsUpdate): UserSettingsUpdate {
	if (!('karakeepApiKey' in data)) {
		return data;
	}

	const { karakeepApiKey, ...rest } = data;

	return {
		...rest,
		karakeepApiKey:
			typeof karakeepApiKey === 'string' && karakeepApiKey.length > 0
				? (() => {
						assertEncryptionEnabled();
						return encryptApiKey(karakeepApiKey);
					})()
				: karakeepApiKey,
	};
}

export function toPublicUserSettings(settings: UserSettings): PublicUserSettings {
	const { karakeepApiKey, ...rest } = settings;

	return {
		...rest,
		hasKarakeepApiKey: Boolean(karakeepApiKey),
	};
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
	const result = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
	});
	return result ? decryptUserSettingsSecrets(result) : null;
}

export async function createUserSettings(
	userId: string,
	data?: UserSettingsUpdate
): Promise<UserSettings> {
	const now = new Date();
	const preparedData = prepareUserSettingsWrite(data ?? {});
	const [result] = await db
		.insert(userSettings)
		.values({
			id: generateId(),
			userId,
			timezone: preparedData.timezone ?? 'UTC',
			privacyMode: preparedData.privacyMode ?? false,
			contextMemoryEnabled: preparedData.contextMemoryEnabled ?? false,
			persistentMemoryEnabled: preparedData.persistentMemoryEnabled ?? false,
			youtubeTranscriptsEnabled: preparedData.youtubeTranscriptsEnabled ?? false,
			webScrapingEnabled: preparedData.webScrapingEnabled ?? false,
			mcpEnabled: preparedData.mcpEnabled ?? false,
			followUpQuestionsEnabled: preparedData.followUpQuestionsEnabled ?? true,
			suggestedPromptsEnabled: preparedData.suggestedPromptsEnabled ?? true,
			freeMessagesUsed: preparedData.freeMessagesUsed ?? 0,
			karakeepUrl: preparedData.karakeepUrl ?? null,
			karakeepApiKey: preparedData.karakeepApiKey ?? null,
			theme: preparedData.theme ?? null,
			themePrimaryColor: preparedData.themePrimaryColor ?? null,
			themeAccentColor: preparedData.themeAccentColor ?? null,
			titleModelId: preparedData.titleModelId ?? null,
			followUpModelId: preparedData.followUpModelId ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	return decryptUserSettingsSecrets(result!);
}

export async function updateUserSettings(
	userId: string,
	data: UserSettingsUpdate
): Promise<UserSettings | null> {
	const preparedData = prepareUserSettingsWrite(data);
	const [result] = await db
		.update(userSettings)
		.set({
			...preparedData,
			updatedAt: new Date(),
		})
		.where(eq(userSettings.userId, userId))
		.returning();
	return result ? decryptUserSettingsSecrets(result) : null;
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
