import { json, type RequestEvent } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { prompts } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export async function GET({ request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const userPrompts = await db.query.prompts.findMany({
        where: eq(prompts.userId, userId),
        orderBy: (prompts, { desc }) => [desc(prompts.updatedAt)],
    });

    return json(userPrompts);
}

const variableSchema = z.object({
    name: z.string().min(1).max(50),
    defaultValue: z.string().max(1000).optional(),
    description: z.string().max(200).optional(),
});

const createPromptSchema = z.object({
    name: z.string().min(1).max(100),
    content: z.string().min(1).max(50000),
    description: z.string().max(500).optional(),
    variables: z.array(variableSchema).optional(),
    defaultModelId: z.string().optional(),
    defaultWebSearchMode: z.enum(['off', 'standard', 'deep']).optional(),
    defaultWebSearchProvider: z.enum(['linkup', 'tavily', 'exa', 'kagi', 'perplexity', 'valyu']).optional(),
    appendMode: z.enum(['replace', 'append', 'prepend']).optional(),
});

export async function POST({ request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = createPromptSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const {
        name,
        content,
        description,
        variables,
        defaultModelId,
        defaultWebSearchMode,
        defaultWebSearchProvider,
        appendMode,
    } = result.data;

    const newPrompt = {
        id: generateId(),
        userId,
        name,
        content,
        description: description ?? null,
        variables: variables ?? null,
        defaultModelId: defaultModelId ?? null,
        defaultWebSearchMode: defaultWebSearchMode ?? null,
        defaultWebSearchProvider: defaultWebSearchProvider ?? null,
        appendMode: appendMode ?? 'replace',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(prompts).values(newPrompt);

    return json(newPrompt);
}
