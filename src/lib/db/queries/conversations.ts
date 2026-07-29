import { db, generateId } from '../index';
import { conversations, messages, type Conversation, type Message } from '../schema';
import { eq, desc, and, or, isNull, asc, sql, inArray } from 'drizzle-orm';
import enhancedSearch from '$lib/utils/fuzzy-search';
import { getFirstSentence } from '$lib/utils/strings';
import { sanitizeHtml } from '$lib/utils/html-sanitizer';

const messageRoleOrder = sql<number>`
	case
		when ${messages.role} = 'system' then 0
		when ${messages.role} = 'user' then 1
		when ${messages.role} = 'assistant' then 2
		else 3
	end
`;

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
	const contentHtml =
		messageData.contentHtml === undefined ? undefined : sanitizeHtml(messageData.contentHtml);

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
		contentHtml,
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

	// Preserve original timestamps so the copied branch keeps the same message order.
	for (const msg of messagesToCopy) {
		const contentHtml = msg.contentHtml === null ? null : sanitizeHtml(msg.contentHtml);
		await db.insert(messages).values({
			id: generateId(),
			conversationId: newConversationId,
			role: msg.role,
			content: msg.content,
			contentHtml,
			reasoning: msg.reasoning,
			modelId: msg.modelId,
			provider: msg.provider,
			tokenCount: msg.tokenCount,
			images: msg.images,
			costUsd: msg.costUsd,
			webSearchEnabled: msg.webSearchEnabled,
			reasoningEffort: msg.reasoningEffort,
			annotations: msg.annotations,
			createdAt: msg.createdAt ?? now,
		});
	}

	return newConversationId;
}

/**
 * Apply an update to a conversation the user owns, in one statement.
 *
 * These mutations each used to call getConversationById() first purely to check
 * ownership, then issue the UPDATE — two round trips where the WHERE clause can do
 * the job. getConversationById also permits access to any *public* conversation, so
 * gating on it meant a non-owner could mutate someone else's shared chat.
 */
async function updateOwnedConversation(
	conversationId: string,
	userId: string,
	values: Partial<typeof conversations.$inferInsert>
): Promise<void> {
	const updated = await db
		.update(conversations)
		.set(values)
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.returning({ id: conversations.id });

	if (updated.length === 0) throw new Error('Unauthorized');
}

export async function updateConversationTitle(
	conversationId: string,
	userId: string,
	title: string
): Promise<void> {
	await updateOwnedConversation(conversationId, userId, { title, updatedAt: new Date() });
}

export async function updateConversationProject(
	conversationId: string,
	userId: string,
	projectId: string | null
): Promise<void> {
	await updateOwnedConversation(conversationId, userId, { projectId, updatedAt: new Date() });
}

export async function updateConversationGenerating(
	conversationId: string,
	userId: string,
	generating: boolean
): Promise<void> {
	await updateOwnedConversation(conversationId, userId, { generating, updatedAt: new Date() });
}

export async function updateConversationCost(
	conversationId: string,
	userId: string,
	costUsd: number
): Promise<void> {
	// Incremented in SQL rather than read-modify-written in JS: two generations
	// finishing at once would both read the same starting cost and the second write
	// would discard the first one's charge. Folding ownership into the WHERE also
	// drops a round trip, and closes a hole where getConversationById() granted
	// access to any *public* conversation, letting a non-owner bump its cost.
	await db
		.update(conversations)
		.set({
			costUsd: sql`coalesce(${conversations.costUsd}, 0) + ${costUsd}`,
			updatedAt: new Date(),
		})
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

export async function setConversationPublic(
	conversationId: string,
	userId: string,
	isPublic: boolean
): Promise<void> {
	await updateOwnedConversation(conversationId, userId, { public: isPublic });
}

export async function toggleConversationPin(
	conversationId: string,
	userId: string
): Promise<boolean> {
	// Flipped in SQL and read back via RETURNING, so the pin state cannot be computed
	// from a value that another request has already changed.
	const [updated] = await db
		.update(conversations)
		.set({
			pinned: sql`NOT coalesce(${conversations.pinned}, false)`,
			updatedAt: new Date(),
		})
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.returning({ pinned: conversations.pinned });

	if (!updated) throw new Error('Unauthorized');

	return updated.pinned ?? false;
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
	// Messages will be cascade deleted due to foreign key
	const deleted = await db
		.delete(conversations)
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.returning({ id: conversations.id });

	if (deleted.length === 0) throw new Error('Unauthorized');
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
	userId: string,
	options?: { limit?: number }
): Promise<Message[]> {
	const limit = options?.limit;

	// Issued together rather than one after the other. This is the app's hottest read
	// path and the access check does not constrain the message query, so serialising
	// them just added a round trip to every conversation load. They cannot be merged
	// into a single statement: an empty result would then be ambiguous between "no
	// access" and "conversation with no messages", which callers map to different
	// HTTP statuses.
	const [conv, results] = await Promise.all([
		getConversationById(conversationId, userId),
		db.query.messages.findMany({
			where: eq(messages.conversationId, conversationId),
			orderBy: limit
				? [desc(messages.createdAt), desc(messageRoleOrder), desc(messages.id)]
				: [asc(messages.createdAt), asc(messageRoleOrder), asc(messages.id)],
			...(limit ? { limit } : {}),
		}),
	]);

	if (!conv) throw new Error('Conversation not found');

	return limit ? results.reverse() : results;
}

export async function getPublicConversationMessages(
	conversationId: string,
	options?: { limit?: number }
): Promise<Message[] | null> {
	const conv = await getPublicConversationById(conversationId);
	if (!conv) return null;

	const limit = options?.limit;
	const results = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		orderBy: limit
			? [desc(messages.createdAt), desc(messageRoleOrder), desc(messages.id)]
			: [asc(messages.createdAt), asc(messageRoleOrder), asc(messages.id)],
		...(limit ? { limit } : {}),
	});

	return limit ? results.reverse() : results;
}

/** The subset of a message the search UI needs; keeps whole conversations out of memory. */
export type ConversationSearchMessage = Pick<
	Message,
	'id' | 'conversationId' | 'role' | 'content' | 'createdAt'
>;

interface ConversationSearchResult {
	conversation: Conversation;
	/** Only the messages that matched, not the whole conversation. */
	messages: ConversationSearchMessage[];
	score: number;
	titleMatch: boolean;
}

export async function searchConversations(
	userId: string,
	searchTerm: string,
	searchMode: 'exact' | 'words' | 'fuzzy' = 'fuzzy'
): Promise<ConversationSearchResult[]> {
	const allConversations = await getUserConversations(userId);
	if (allConversations.length === 0) return [];

	// Previously one query per conversation, each selecting every column: a user with
	// 300 conversations paid 301 sequential round trips and pulled their entire chat
	// history — content_html, reasoning and annotations included — into memory on
	// every keystroke. Scoring is fuzzy and happens in JS, so the message bodies do
	// have to come back, but one query and five columns is a different animal.
	const conversationIds = allConversations.map((conversation) => conversation.id);
	const allMessages = await db
		.select({
			id: messages.id,
			conversationId: messages.conversationId,
			role: messages.role,
			content: messages.content,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.innerJoin(conversations, eq(messages.conversationId, conversations.id))
		.where(
			and(eq(conversations.userId, userId), inArray(messages.conversationId, conversationIds))
		);

	const messagesByConversation = new Map<string, ConversationSearchMessage[]>();
	for (const message of allMessages) {
		const bucket = messagesByConversation.get(message.conversationId);
		if (bucket) bucket.push(message);
		else messagesByConversation.set(message.conversationId, [message]);
	}

	const results: ConversationSearchResult[] = [];

	for (const conv of allConversations) {
		const convMessages = messagesByConversation.get(conv.id) ?? [];

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
				// The UI renders this as "N matching messages", but it used to receive
				// every message in the conversation, so the count was always the total.
				messages: messageSearch.map((result) => result.item),
				score: bestScore,
				titleMatch,
			});
		}
	}

	return results.sort((a, b) => b.score - a.score);
}
