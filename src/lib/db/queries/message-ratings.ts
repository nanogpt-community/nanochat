import { db, generateId } from '../index';
import { messageRatings, messages, type MessageRating, type NewMessageRating } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createMessageRating(data: {
	messageId: string;
	userId: string;
	thumbs?: 'up' | 'down';
	rating?: number;
	categories?: string[];
	feedback?: string;
}): Promise<MessageRating> {
	const now = new Date();

	// Check if rating already exists
	const existing = await getMessageRatingByUserAndMessage(data.userId, data.messageId);

	if (existing) {
		// Update existing rating
		return updateMessageRating(existing.id, {
			thumbs: data.thumbs,
			rating: data.rating,
			categories: data.categories,
			feedback: data.feedback,
		});
	}

	// Create new rating
	const [result] = await db
		.insert(messageRatings)
		.values({
			id: generateId(),
			messageId: data.messageId,
			userId: data.userId,
			thumbs: data.thumbs,
			rating: data.rating,
			categories: data.categories,
			feedback: data.feedback,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	return result!;
}

export async function updateMessageRating(
	ratingId: string,
	data: {
		thumbs?: 'up' | 'down';
		rating?: number;
		categories?: string[];
		feedback?: string;
	}
): Promise<MessageRating> {
	const [result] = await db
		.update(messageRatings)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(messageRatings.id, ratingId))
		.returning();

	return result!;
}

export async function getMessageRatingById(ratingId: string): Promise<MessageRating | null> {
	const result = await db.query.messageRatings.findFirst({
		where: eq(messageRatings.id, ratingId),
	});
	return result ?? null;
}

export async function getMessageRatingByUserAndMessage(
	userId: string,
	messageId: string
): Promise<MessageRating | null> {
	const result = await db.query.messageRatings.findFirst({
		where: and(eq(messageRatings.userId, userId), eq(messageRatings.messageId, messageId)),
	});
	return result ?? null;
}

export async function getMessageRatingsByUser(userId: string): Promise<MessageRating[]> {
	const results = await db.query.messageRatings.findMany({
		where: eq(messageRatings.userId, userId),
	});
	return results;
}

export async function deleteMessageRating(ratingId: string): Promise<void> {
	await db.delete(messageRatings).where(eq(messageRatings.id, ratingId));
}

/**
 * The current user's ratings for every message in a conversation.
 *
 * Without this the rating widget had no way to load existing state, so
 * `initialRating` was never supplied and thumbs/stars reset on every reload.
 */
export async function getMessageRatingsForConversation(
	userId: string,
	conversationId: string
): Promise<MessageRating[]> {
	const rows = await db
		.select({ rating: messageRatings })
		.from(messageRatings)
		.innerJoin(messages, eq(messageRatings.messageId, messages.id))
		.where(and(eq(messageRatings.userId, userId), eq(messages.conversationId, conversationId)));

	return rows.map((row) => row.rating);
}
