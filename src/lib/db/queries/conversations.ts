import { db, generateId } from '../index';
import { conversations, messages, type Conversation, type Message } from '../schema';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import enhancedSearch from '$lib/utils/fuzzy-search';
import { getFirstSentence } from '$lib/utils/strings';

export async function getUserConversations(
	userId: string,
	projectId?: string | null
): Promise<Conversation[]> {
	const filters = [
		eq(conversations.userId, userId),
		// Filter out temporary conversations
		or(eq(conversations.temporary, false), isNull(conversations.temporary)),
	];

	if (projectId !== undefined) {
		if (projectId === null) {
			filters.push(isNull(conversations.projectId));
		} else {
			filters.push(eq(conversations.projectId, projectId));
		}
	}

	return db.query.conversations.findMany({
		where: and(...filters),
		orderBy: [desc(conversations.updatedAt)],
	});
}

export async function getConversationById(
	conversationId: string,
	userId: string
): Promise<Conversation | null> {
	const result = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});

	if (!result) return null;

	// Check access - either owner or public
	if (!result.public && result.userId !== userId) {
		throw new Error('Unauthorized');
	}

	return result;
}

export async function getPublicConversationById(
	conversationId: string
): Promise<Conversation | null> {
	const result = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.public, true)),
	});
	return result ?? null;
}

export async function createConversation(
	userId: string,
	title?: string,
	projectId?: string | null
): Promise<Conversation> {
	const now = new Date();
	const [result] = await db
		.insert(conversations)
		.values({
			id: generateId(),
			userId,
			title: title ?? 'Untitled',
			projectId,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	return result!;
}

export async function createConversationWithMessage(
	userId: string,
	messageData: {
		content: string;
		contentHtml?: string;
		role: 'user' | 'assistant' | 'system';
		images?: Array<{ url: string; storage_id: string; fileName?: string }>;
		webSearchEnabled?: boolean;
		projectId?: string | null;
	}
): Promise<{ conversationId: string; messageId: string }> {
	const now = new Date();
	const conversationId = generateId();
	const messageId = generateId();

	// Create conversation
	await db.insert(conversations).values({
		id: conversationId,
		userId,
		title: getFirstSentence(messageData.content)[0] || 'Untitled',
		projectId: messageData.projectId,
		generating: true,
		createdAt: now,
		updatedAt: now,
	});

	// Create message
	await db.insert(messages).values({
		id: messageId,
		conversationId,
		role: messageData.role,
		content: messageData.content,
		contentHtml: messageData.contentHtml,
		images: messageData.images,
		webSearchEnabled: messageData.webSearchEnabled,
		createdAt: now,
	});

	return { conversationId, messageId };
}

export async function createBranchedConversation(
	userId: string,
	originalConversationId: string,
	fromMessageId: string
): Promise<string> {
	const originalConversation = await getConversationById(originalConversationId, userId);
	if (!originalConversation) throw new Error('Conversation not found');

	// Get all messages up to and including the fromMessageId
	const allMessages = await getConversationMessages(originalConversationId, userId);
	const messageIndex = allMessages.findIndex((m) => m.id === fromMessageId);

	if (messageIndex === -1) throw new Error('Message not found');

	const messagesToCopy = allMessages.slice(0, messageIndex + 1);
	const now = new Date();
	const newConversationId = generateId();

	// Create new conversation
	await db.insert(conversations).values({
		id: newConversationId,
		userId,
		title: originalConversation.title,
		branchedFrom: originalConversationId,
		createdAt: now,
		updatedAt: now,
	});

	// Copy messages one at a time to avoid batching issues
	for (const msg of messagesToCopy) {
		await db.insert(messages).values({
			id: generateId(),
			conversationId: newConversationId,
			role: msg.role,
			content: msg.content,
			contentHtml: msg.contentHtml,
			reasoning: msg.reasoning,
			modelId: msg.modelId,
			provider: msg.provider,
			tokenCount: msg.tokenCount,
			images: msg.images,
			costUsd: msg.costUsd,
			webSearchEnabled: msg.webSearchEnabled,
			reasoningEffort: msg.reasoningEffort,
			annotations: msg.annotations,
			createdAt: now,
		});
	}

	return newConversationId;
}

export async function updateConversationTitle(
	conversationId: string,
	userId: string,
	title: string
): Promise<void> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv || conv.userId !== userId) throw new Error('Unauthorized');

	await db
		.update(conversations)
		.set({ title, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

export async function updateConversationProject(
	conversationId: string,
	userId: string,
	projectId: string | null
): Promise<void> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv || conv.userId !== userId) throw new Error('Unauthorized');

	await db
		.update(conversations)
		.set({ projectId, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

export async function updateConversationGenerating(
	conversationId: string,
	userId: string,
	generating: boolean
): Promise<void> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv || conv.userId !== userId) throw new Error('Unauthorized');

	await db
		.update(conversations)
		.set({ generating, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

export async function updateConversationCost(
	conversationId: string,
	userId: string,
	costUsd: number
): Promise<void> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv) return;

	const currentCost = conv.costUsd ?? 0;
	await db
		.update(conversations)
		.set({ costUsd: currentCost + costUsd, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

export async function setConversationPublic(
	conversationId: string,
	userId: string,
	isPublic: boolean
): Promise<void> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv || conv.userId !== userId) throw new Error('Unauthorized');

	await db
		.update(conversations)
		.set({ public: isPublic })
		.where(eq(conversations.id, conversationId));
}

export async function toggleConversationPin(
	conversationId: string,
	userId: string
): Promise<boolean> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv || conv.userId !== userId) throw new Error('Unauthorized');

	const newPinned = !conv.pinned;
	await db
		.update(conversations)
		.set({ pinned: newPinned, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	return newPinned;
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv || conv.userId !== userId) throw new Error('Unauthorized');

	// Messages will be cascade deleted due to foreign key
	await db.delete(conversations).where(eq(conversations.id, conversationId));
}

export async function deleteAllConversations(userId: string): Promise<void> {
	// Messages will be cascade deleted due to foreign key constraint
	await db.delete(conversations).where(eq(conversations.userId, userId));
}

// Delete all temporary conversations for a user (called on session start)
export async function deleteTemporaryConversations(userId: string): Promise<void> {
	// Messages will be cascade deleted due to foreign key constraint
	await db
		.delete(conversations)
		.where(and(eq(conversations.userId, userId), eq(conversations.temporary, true)));
}

export async function getConversationMessages(
	conversationId: string,
	userId: string
): Promise<Message[]> {
	const conv = await getConversationById(conversationId, userId);
	if (!conv) throw new Error('Conversation not found');

	return db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [messages.createdAt],
	});
}

export async function getPublicConversationMessages(
	conversationId: string
): Promise<Message[] | null> {
	const conv = await getPublicConversationById(conversationId);
	if (!conv) return null;

	return db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: [messages.createdAt],
	});
}

interface ConversationSearchResult {
	conversation: Conversation;
	messages: Message[];
	score: number;
	titleMatch: boolean;
}

export async function searchConversations(
	userId: string,
	searchTerm: string,
	searchMode: 'exact' | 'words' | 'fuzzy' = 'fuzzy'
): Promise<ConversationSearchResult[]> {
	const allConversations = await getUserConversations(userId);
	const results: ConversationSearchResult[] = [];

	for (const conv of allConversations) {
		const convMessages = await db.query.messages.findMany({
			where: eq(messages.conversationId, conv.id),
		});

		// Search in title
		const titleSearch = enhancedSearch({
			needle: searchTerm,
			haystack: [{ title: conv.title }],
			property: 'title',
			mode: searchMode,
			minScore: 0.3,
		});
		const titleMatch = titleSearch.length > 0;

		// Search in message contents
		const messageSearch = enhancedSearch({
			needle: searchTerm,
			haystack: convMessages,
			property: 'content',
			mode: searchMode,
			minScore: 0.3,
		});

		if (titleMatch || messageSearch.length > 0) {
			const bestTitleScore = titleSearch[0]?.score || 0;
			const bestMessageScore = messageSearch[0]?.score || 0;
			const bestScore = Math.max(bestTitleScore, bestMessageScore);

			results.push({
				conversation: conv,
				messages: convMessages,
				score: bestScore,
				titleMatch,
			});
		}
	}

	return results.sort((a, b) => b.score - a.score);
}
