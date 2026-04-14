import { db, generateId } from '../index';
import { userEnabledModels, type UserEnabledModel } from '../schema';
import { eq, and, inArray, not, or } from 'drizzle-orm';
import { Provider } from '$lib/types';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';

const defaultNanoGptModels = [
	'zai-org/glm-5',
	'zai-org/glm-5:thinking',
	'minimax/minimax-m2.7',
	'moonshotai/kimi-k2.5',
	'moonshotai/kimi-k2.5:thinking',
	'deepseek/deepseek-v3.2-speciale',
	'deepseek/deepseek-v3.2:thinking',
	'deepseek/deepseek-v3.2',
	'qwen/qwen3.5-397b-a17b',
	'qwen/qwen3.5-397b-a17b-thinking',
	'google/gemma-4-31b-it',
	'google/gemma-4-31b-it:thinking',
	'google/gemma-4-26b-a4b-it',
	'google/gemma-4-26b-a4b-it:thinking',
	'nvidia/nemotron-3-super-120b-a12b',
	'nvidia/nemotron-3-super-120b-a12b:thinking',
	'openai/gpt-oss-120b',
	'openai/gpt-oss-20b',
];

const nanoGptAllDisabledSentinel = {
	provider: '__internal__',
	modelId: '__nanogpt_all_disabled__',
};

export function getModelKey(args: { provider: string; modelId: string }): string {
	return `${args.provider}:${args.modelId}`;
}

export async function getEnabledModels(userId: string): Promise<Record<string, UserEnabledModel>> {
	const models = await db.query.userEnabledModels.findMany({
		where: and(eq(userEnabledModels.userId, userId), eq(userEnabledModels.provider, 'nanogpt')),
	});

	return models.reduce(
		(acc, model) => {
			acc[getModelKey({ provider: model.provider, modelId: model.modelId })] = model;
			return acc;
		},
		{} as Record<string, UserEnabledModel>
	);
}

export async function isModelEnabled(
	userId: string,
	provider: string,
	modelId: string
): Promise<boolean> {
	const model = await db.query.userEnabledModels.findFirst({
		where: and(
			eq(userEnabledModels.userId, userId),
			eq(userEnabledModels.provider, provider),
			eq(userEnabledModels.modelId, modelId)
		),
	});
	return !!model;
}

export async function getEnabledModel(
	userId: string,
	provider: string,
	modelId: string
): Promise<UserEnabledModel | null> {
	const result = await db.query.userEnabledModels.findFirst({
		where: and(
			eq(userEnabledModels.userId, userId),
			eq(userEnabledModels.provider, provider),
			eq(userEnabledModels.modelId, modelId)
		),
	});
	return result ?? null;
}

export async function setModelEnabled(
	userId: string,
	provider: string,
	modelId: string,
	enabled: boolean
): Promise<void> {
	const now = new Date();
	const existing = await getEnabledModel(userId, provider, modelId);

	if (enabled && existing) return; // Nothing to do

	if (existing) {
		await db.delete(userEnabledModels).where(eq(userEnabledModels.id, existing.id));
	} else {
		await db.insert(userEnabledModels).values({
			id: generateId(),
			userId,
			provider,
			modelId,
			pinned: false,
			createdAt: now,
			updatedAt: now,
		});
	}
}

export async function setAllProviderModelsEnabled(
	userId: string,
	provider: string,
	enabled: boolean,
	options?: {
		subscriptionOnly?: boolean;
	}
): Promise<void> {
	if (provider !== Provider.NanoGPT) {
		throw new Error('Bulk model updates are only supported for NanoGPT');
	}

	if (!enabled) {
		await db
			.delete(userEnabledModels)
			.where(and(eq(userEnabledModels.userId, userId), eq(userEnabledModels.provider, provider)));

		const existingSentinel = await db.query.userEnabledModels.findFirst({
			where: and(
				eq(userEnabledModels.userId, userId),
				eq(userEnabledModels.provider, nanoGptAllDisabledSentinel.provider),
				eq(userEnabledModels.modelId, nanoGptAllDisabledSentinel.modelId)
			),
		});
		if (!existingSentinel) {
			await db.insert(userEnabledModels).values({
				id: generateId(),
				userId,
				provider: nanoGptAllDisabledSentinel.provider,
				modelId: nanoGptAllDisabledSentinel.modelId,
				pinned: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
		return;
	}

	const modelsResult = await getNanoGPTModels();
	if (!modelsResult.isOk()) {
		throw new Error(modelsResult.error);
	}

	const availableModels = options?.subscriptionOnly
		? modelsResult.value.filter((model) => model.subscription?.included === true)
		: modelsResult.value;
	const availableModelIds = availableModels.map((model) => model.id);
	const existingModels = await db.query.userEnabledModels.findMany({
		where: and(eq(userEnabledModels.userId, userId), eq(userEnabledModels.provider, provider)),
	});
	const existingModelIds = new Set(existingModels.map((model) => model.modelId));

	const now = new Date();
	const modelsToEnable = availableModelIds
		.filter((modelId) => !existingModelIds.has(modelId))
		.map((modelId) => ({
			id: generateId(),
			userId,
			provider,
			modelId,
			pinned: false,
			createdAt: now,
			updatedAt: now,
		}));

	if (options?.subscriptionOnly && availableModelIds.length > 0) {
		await db
			.delete(userEnabledModels)
			.where(
				and(
					eq(userEnabledModels.userId, userId),
					eq(userEnabledModels.provider, provider),
					not(inArray(userEnabledModels.modelId, availableModelIds))
				)
			);
	}

	await db
		.delete(userEnabledModels)
		.where(
			and(
				eq(userEnabledModels.userId, userId),
				eq(userEnabledModels.provider, nanoGptAllDisabledSentinel.provider),
				eq(userEnabledModels.modelId, nanoGptAllDisabledSentinel.modelId)
			)
		);

	if (modelsToEnable.length === 0) return;

	await db.insert(userEnabledModels).values(modelsToEnable);
}

export async function toggleModelPinned(userId: string, modelId: string): Promise<boolean> {
	const model = await db.query.userEnabledModels.findFirst({
		where: and(eq(userEnabledModels.userId, userId), eq(userEnabledModels.id, modelId)),
	});

	if (!model) throw new Error('Model not found');

	const newPinned = !isPinned(model);
	await db
		.update(userEnabledModels)
		.set({ pinned: newPinned, updatedAt: new Date() })
		.where(eq(userEnabledModels.id, model.id));

	return newPinned;
}

export function isPinned(model: UserEnabledModel): boolean {
	return model.pinned === null || model.pinned === true;
}

export async function enableInitialModels(userId: string): Promise<void> {
	const existingModels = await db.query.userEnabledModels.findMany({
		where: eq(userEnabledModels.userId, userId),
	});

	if (existingModels.length > 0) return;

	await resetDefaultNanoGptModels(userId);
}

export async function resetDefaultNanoGptModels(userId: string): Promise<void> {
	const now = new Date();
	await db
		.delete(userEnabledModels)
		.where(
			and(
				eq(userEnabledModels.userId, userId),
				or(
					eq(userEnabledModels.provider, Provider.NanoGPT),
					eq(userEnabledModels.provider, nanoGptAllDisabledSentinel.provider)
				)
			)
		);

	await db.insert(userEnabledModels).values(
		defaultNanoGptModels.map((modelId) => ({
			id: generateId(),
			userId,
			provider: Provider.NanoGPT,
			modelId,
			pinned: true,
			createdAt: now,
			updatedAt: now,
		}))
	);
}

export async function enableDefaultModelsOnKeyAdd(userId: string): Promise<void> {
	await resetDefaultNanoGptModels(userId);
}
