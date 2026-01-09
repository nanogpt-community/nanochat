import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { assistants } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

const updateAssistantSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    systemPrompt: z.string().max(10000).optional(),
    defaultModelId: z.string().nullable().optional(),
    defaultWebSearchMode: z.enum(['off', 'standard', 'deep']).nullable().optional(),
    defaultWebSearchProvider: z.enum(['linkup', 'tavily', 'exa', 'kagi']).nullable().optional(),
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

    const result = updateAssistantSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const assistant = await db.query.assistants.findFirst({
        where: and(eq(assistants.id, id), eq(assistants.userId, userId))
    });

    if (!assistant) {
        return json({ error: 'Assistant not found' }, { status: 404 });
    }

    const { name, systemPrompt, defaultModelId, defaultWebSearchMode, defaultWebSearchProvider } = result.data;

    await db.update(assistants)
        .set({
            ...(name ? { name } : {}),
            ...(systemPrompt !== undefined ? { systemPrompt } : {}),
            ...(defaultModelId !== undefined ? { defaultModelId } : {}),
            ...(defaultWebSearchMode !== undefined ? { defaultWebSearchMode } : {}),
            ...(defaultWebSearchProvider !== undefined ? { defaultWebSearchProvider } : {}),
            updatedAt: new Date()
        })
        .where(eq(assistants.id, id));

    return json({ success: true });
}

export async function DELETE({ request, params }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    const id = params.id as string;

    const assistant = await db.query.assistants.findFirst({
        where: and(eq(assistants.id, id), eq(assistants.userId, userId))
    });

    if (!assistant) {
        return json({ error: 'Assistant not found' }, { status: 404 });
    }

    if (assistant.isDefault) {
        return json({ error: 'Cannot delete default assistant' }, { status: 400 });
    }

    await db.delete(assistants).where(eq(assistants.id, id));

    return json({ success: true });
}

export async function POST({ request, params }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    const id = params.id as string;

    let body;
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    // Check if this is a set-default action
    if (body.action === 'setDefault') {
        const assistant = await db.query.assistants.findFirst({
            where: and(eq(assistants.id, id), eq(assistants.userId, userId))
        });

        if (!assistant) {
            return json({ error: 'Assistant not found' }, { status: 404 });
        }

        // Remove default from all user's assistants
        await db.update(assistants)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(assistants.userId, userId));

        // Set this one as default
        await db.update(assistants)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(assistants.id, id));

        return json({ success: true });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
}
