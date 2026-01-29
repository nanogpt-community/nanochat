import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { prompts } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export async function GET({ request, params }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    const id = params.id as string;

    const prompt = await db.query.prompts.findFirst({
        where: and(eq(prompts.id, id), eq(prompts.userId, userId)),
    });

    if (!prompt) {
        return json({ error: 'Prompt not found' }, { status: 404 });
    }

    return json(prompt);
}

const variableSchema = z.object({
    name: z.string().min(1).max(50),
    defaultValue: z.string().max(1000).optional(),
    description: z.string().max(200).optional(),
});

const updatePromptSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    content: z.string().min(1).max(50000).optional(),
    description: z.string().max(500).nullable().optional(),
    variables: z.array(variableSchema).nullable().optional(),
    defaultModelId: z.string().nullable().optional(),
    defaultWebSearchMode: z.enum(['off', 'standard', 'deep']).nullable().optional(),
    defaultWebSearchProvider: z.enum(['linkup', 'tavily', 'exa', 'kagi', 'perplexity', 'valyu']).nullable().optional(),
    appendMode: z.enum(['replace', 'append', 'prepend']).optional(),
});

export async function PATCH({ request, params }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    const id = params.id as string;

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = updatePromptSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const prompt = await db.query.prompts.findFirst({
        where: and(eq(prompts.id, id), eq(prompts.userId, userId)),
    });

    if (!prompt) {
        return json({ error: 'Prompt not found' }, { status: 404 });
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

    await db
        .update(prompts)
        .set({
            ...(name !== undefined ? { name } : {}),
            ...(content !== undefined ? { content } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(variables !== undefined ? { variables } : {}),
            ...(defaultModelId !== undefined ? { defaultModelId } : {}),
            ...(defaultWebSearchMode !== undefined ? { defaultWebSearchMode } : {}),
            ...(defaultWebSearchProvider !== undefined ? { defaultWebSearchProvider } : {}),
            ...(appendMode !== undefined ? { appendMode } : {}),
            updatedAt: new Date(),
        })
        .where(eq(prompts.id, id));

    return json({ success: true });
}

export async function DELETE({ request, params }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    const id = params.id as string;

    const prompt = await db.query.prompts.findFirst({
        where: and(eq(prompts.id, id), eq(prompts.userId, userId)),
    });

    if (!prompt) {
        return json({ error: 'Prompt not found' }, { status: 404 });
    }

    await db.delete(prompts).where(eq(prompts.id, id));

    return json({ success: true });
}
