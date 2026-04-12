import { db, generateId } from '../index';
import { messages, conversations, type Message } from '../schema';
import { eq, asc, sql } from 'drizzle-orm';
import { sanitizeHtml } from '$lib/utils/html-sanitizer';

const messageRoleOrder = sql<number>`
	case
		when ${messages.role} = 'system' then 0
		when ${messages.role} = 'user' then 1
		when ${messages.role} = 'assistant' then 2
		else 3
	end
`;

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
	const contentHtml = data.contentHtml === undefined ? undefined : sanitizeHtml(data.contentHtml);
	const [result] = await db
		.insert(messages)
		.values({
			id: generateId(),
			conversationId,
			role: data.role,
			content: data.content,
			contentHtml,
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

	return result!;
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
	const contentHtml = data.contentHtml === undefined ? undefined : sanitizeHtml(data.contentHtml);
	await db
		.update(messages)
		.set({
			...data,
			contentHtml,
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
	const contentHtml = data.contentHtml === undefined ? undefined : sanitizeHtml(data.contentHtml);
	await db
		.update(messages)
		.set({
			...data,
			contentHtml,
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

export async function getMessagesByConversation(conversationId: string): Promise<Message[]> {
	const result = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [asc(messages.createdAt), asc(messageRoleOrder), asc(messages.id)],
	});
	return result;
}

export async function deleteMessage(messageId: string): Promise<void> {
	await db.delete(messages).where(eq(messages.id, messageId));
}

export async function setMessageStarred(messageId: string, starred: boolean): Promise<void> {
	await db.update(messages).set({ starred }).where(eq(messages.id, messageId));
}

export async function getStarredMessages(userId: string): Promise<Message[]> {
	// Get all starred messages for conversations owned by the user
	const result = await db
		.select({
			message: messages,
		})
		.from(messages)
		.innerJoin(conversations, eq(messages.conversationId, conversations.id))
		.where(eq(conversations.userId, userId))
		.orderBy(asc(messages.createdAt), asc(messageRoleOrder), asc(messages.id));

	// Filter to only starred messages and return the message objects
	return result.filter((r) => r.message.starred === true).map((r) => r.message);
}
