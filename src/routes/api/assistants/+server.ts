import { json, type RequestEvent } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { assistants } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export async function GET({ locals }: RequestEvent) {
    const session = await locals.auth();
    if (!session?.user?.id) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    let userAssistants = await db.query.assistants.findMany({
        where: eq(assistants.userId, userId),
    });

    if (userAssistants.length === 0) {
        // Create default assistant
        const defaultAssistant = {
            id: generateId(),
            userId,
            name: 'Default',
            description: null,
            systemPrompt: '',
            isDefault: true,
            defaultModelId: null,
            defaultWebSearchMode: null,
            defaultWebSearchProvider: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await db.insert(assistants).values(defaultAssistant);
        userAssistants = [defaultAssistant];
    }

    return json(userAssistants);
}

const createAssistantSchema = z.object({
    name: z.string().min(1).max(100),
    systemPrompt: z.string().max(10000),
    defaultModelId: z.string().optional(),
    defaultWebSearchMode: z.enum(['off', 'standard', 'deep']).optional(),
    defaultWebSearchProvider: z.enum(['linkup', 'tavily', 'exa', 'kagi']).optional(),
});

export async function POST({ request, locals }: RequestEvent) {
    const session = await locals.auth();
    if (!session?.user?.id) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = createAssistantSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const { name, systemPrompt, defaultModelId, defaultWebSearchMode, defaultWebSearchProvider } = result.data;

    const newAssistant = {
        id: generateId(),
        userId,
        name,
        systemPrompt,
        isDefault: false,
        defaultModelId: defaultModelId ?? null,
        defaultWebSearchMode: defaultWebSearchMode ?? null,
        defaultWebSearchProvider: defaultWebSearchProvider ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(assistants).values(newAssistant);

    return json(newAssistant);
}

