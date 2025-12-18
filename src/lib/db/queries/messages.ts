import { db, generateId } from '../index';
import { messages, conversations, type Message } from '../schema';
import { eq } from 'drizzle-orm';

export async function createMessage(
    conversationId: string,
    data: {
        role: 'user' | 'assistant' | 'system';
        content: string;
        contentHtml?: string;
        modelId?: string;
        provider?: string;
        tokenCount?: number;
        images?: Array<{ url: string; storage_id: string; fileName?: string }>;
        webSearchEnabled?: boolean;
        reasoningEffort?: 'low' | 'medium' | 'high';
    }
): Promise<Message> {
    const now = new Date();
    const [result] = await db
        .insert(messages)
        .values({
            id: generateId(),
            conversationId,
            role: data.role,
            content: data.content,
            contentHtml: data.contentHtml,
            modelId: data.modelId,
            provider: data.provider,
            tokenCount: data.tokenCount,
            images: data.images,
            webSearchEnabled: data.webSearchEnabled,
            reasoningEffort: data.reasoningEffort,
            createdAt: now,
        })
        .returning();

    // Update conversation's updatedAt
    await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, conversationId));

    return result;
}

export async function updateMessageContent(
    messageId: string,
    data: {
        content?: string;
        contentHtml?: string;
        reasoning?: string;
        generationId?: string;
        reasoningEffort?: 'low' | 'medium' | 'high';
        annotations?: Array<Record<string, unknown>>;
    }
): Promise<void> {
    await db
        .update(messages)
        .set({
            ...data,
        })
        .where(eq(messages.id, messageId));
}

export async function updateMessage(
    messageId: string,
    data: {
        tokenCount?: number;
        costUsd?: number;
        generationId?: string;
        contentHtml?: string;
    }
): Promise<void> {
    await db
        .update(messages)
        .set({
            ...data,
        })
        .where(eq(messages.id, messageId));
}

export async function updateMessageError(
    messageId: string | undefined,
    conversationId: string,
    error?: string
): Promise<void> {
    if (messageId) {
        await db.update(messages).set({ error }).where(eq(messages.id, messageId));
    }

    // Reset generating state
    await db
        .update(conversations)
        .set({ generating: false, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
}

export async function getMessageById(messageId: string): Promise<Message | null> {
    const result = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
    });
    return result ?? null;
}
