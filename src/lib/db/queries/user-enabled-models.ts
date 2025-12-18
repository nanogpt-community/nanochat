import { db, generateId } from '../index';
import { userEnabledModels, type UserEnabledModel } from '../schema';
import { eq, and, inArray, not } from 'drizzle-orm';
import { Provider } from '$lib/types';

export function getModelKey(args: { provider: string; modelId: string }): string {
    return `${args.provider}:${args.modelId}`;
}

export async function getEnabledModels(
    userId: string
): Promise<Record<string, UserEnabledModel>> {
    const models = await db.query.userEnabledModels.findMany({
        where: and(
            eq(userEnabledModels.userId, userId),
            eq(userEnabledModels.provider, 'nanogpt')
        ),
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
    const now = new Date();
    const initialModels = [
        'zai-org/glm-4.6v',
        'moonshotai/kimi-k2-thinking',
        'deepseek/deepseek-v3.2',
        'x-ai/grok-4.1-fast',
        'google/gemini-3-flash-preview',
        'gpt-5-mini'
    ];

    // Remove any leftover OpenRouter models or non-default NanoGPT models
    await db
        .delete(userEnabledModels)
        .where(
            and(
                eq(userEnabledModels.userId, userId),
                not(inArray(userEnabledModels.modelId, initialModels))
            )
        );

    const existingModels = await db.query.userEnabledModels.findMany({
        where: eq(userEnabledModels.userId, userId),
    });

    if (existingModels.length > 0) return;

    await db.insert(userEnabledModels).values(
        initialModels.map((modelId) => ({
            id: generateId(),
            userId,
            provider: 'nanogpt',
            modelId,
            pinned: true,
            createdAt: now,
            updatedAt: now,
        }))
    );
}

export async function enableDefaultModelsOnKeyAdd(userId: string): Promise<void> {
    const now = new Date();
    const defaultModels = [
        'zai-org/glm-4.6v',
        'moonshotai/kimi-k2-thinking',
        'deepseek/deepseek-v3.2',
        'x-ai/grok-4.1-fast',
        'google/gemini-3-flash-preview',
        'gpt-5-mini'
    ];

    // Clean up anything else when adding a key
    await db
        .delete(userEnabledModels)
        .where(
            and(
                eq(userEnabledModels.userId, userId),
                not(inArray(userEnabledModels.modelId, defaultModels))
            )
        );

    for (const modelId of defaultModels) {
        const existing = await getEnabledModel(userId, 'nanogpt', modelId);
        if (existing) continue;

        await db.insert(userEnabledModels).values({
            id: generateId(),
            userId,
            provider: 'nanogpt',
            modelId,
            pinned: true,
            createdAt: now,
            updatedAt: now,
        });
    }
}
