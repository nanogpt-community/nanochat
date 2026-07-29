import { db, generateId } from '../index';
import {
	modelPerformanceStats,
	messages,
	messageRatings,
	messageInteractions,
	type ModelPerformanceStats,
} from '../schema';
import { eq, and, sql } from 'drizzle-orm';

export async function getModelPerformanceStatsByUser(
	userId: string
): Promise<ModelPerformanceStats[]> {
	const results = await db.query.modelPerformanceStats.findMany({
		where: eq(modelPerformanceStats.userId, userId),
	});
	return results;
}

export async function getModelPerformanceStats(
	userId: string,
	modelId: string,
	provider: string
): Promise<ModelPerformanceStats | null> {
	const result = await db.query.modelPerformanceStats.findFirst({
		where: and(
			eq(modelPerformanceStats.userId, userId),
			eq(modelPerformanceStats.modelId, modelId),
			eq(modelPerformanceStats.provider, provider)
		),
	});
	return result ?? null;
}

export async function upsertModelPerformanceStats(data: {
	userId: string;
	modelId: string;
	provider: string;
	totalMessages: number;
	avgRating?: number;
	thumbsUpCount: number;
	thumbsDownCount: number;
	regenerateCount: number;
	avgResponseTime?: number;
	avgTokens?: number;
	totalCost: number;
	errorCount: number;
	accurateCount: number;
	helpfulCount: number;
	creativeCount: number;
	fastCount: number;
	costEffectiveCount: number;
}): Promise<ModelPerformanceStats> {
	const existing = await getModelPerformanceStats(data.userId, data.modelId, data.provider);

	if (existing) {
		const [result] = await db
			.update(modelPerformanceStats)
			.set({
				...data,
				lastUpdated: new Date(),
			})
			.where(eq(modelPerformanceStats.id, existing.id))
			.returning();
		return result!;
	}

	const [result] = await db
		.insert(modelPerformanceStats)
		.values({
			id: generateId(),
			...data,
			lastUpdated: new Date(),
		})
		.returning();

	return result!;
}

/** Rating categories, mapped to the stats column each one feeds. */
const RATING_CATEGORIES = [
	['Accurate', 'accurateCount'],
	['Helpful', 'helpfulCount'],
	['Creative', 'creativeCount'],
	['Fast', 'fastCount'],
	['Cost-effective', 'costEffectiveCount'],
] as const;

/**
 * Recompute every model's stats for a user using grouped aggregates.
 *
 * The previous implementation looped over each distinct model and ran
 * calculateModelPerformanceStats() per model — and each of those pulled every
 * matching message row plus two relations, then reduced them in JS, then did a
 * select-and-update. A user who had tried 25 models paid well over a hundred
 * sequential round trips, each one scanning messages. Postgres does the same
 * arithmetic in three grouped queries.
 */
export async function calculateAllModelPerformanceStats(
	userId: string
): Promise<ModelPerformanceStats[]> {
	const ownedByUser = sql`${messages.conversationId} IN (SELECT id FROM ${sql.identifier('conversations')} WHERE ${sql.identifier('user_id')} = ${userId})`;
	const isChatModel = and(
		sql`${messages.modelId} IS NOT NULL`,
		sql`${messages.provider} IS NOT NULL`
	);

	// Speed metrics only count assistant messages that actually reported figures.
	const speedSample = sql`${messages.role} = 'assistant' AND ${messages.tokenCount} IS NOT NULL`;

	const messageAggregates = await db
		.select({
			modelId: messages.modelId,
			provider: messages.provider,
			totalMessages: sql<number>`count(*)::int`,
			totalCost: sql<number>`coalesce(sum(${messages.costUsd}), 0)::float8`,
			errorCount: sql<number>`count(*) FILTER (WHERE ${messages.error} IS NOT NULL)::int`,
			avgTokens: sql<
				number | null
			>`avg(${messages.tokenCount}) FILTER (WHERE ${speedSample})::float8`,
			avgResponseTime: sql<
				number | null
			>`avg(${messages.responseTimeMs}) FILTER (WHERE ${speedSample} AND ${messages.responseTimeMs} > 0)::float8`,
		})
		.from(messages)
		.where(and(ownedByUser, isChatModel))
		.groupBy(messages.modelId, messages.provider);

	const categorySelections = Object.fromEntries(
		RATING_CATEGORIES.map(([label, column]) => [
			column,
			sql<number>`count(*) FILTER (WHERE ${messageRatings.categories} @> ${JSON.stringify([label])}::jsonb)::int`,
		])
	) as Record<(typeof RATING_CATEGORIES)[number][1], ReturnType<typeof sql<number>>>;

	const ratingAggregates = await db
		.select({
			modelId: messages.modelId,
			provider: messages.provider,
			avgRating: sql<
				number | null
			>`avg(${messageRatings.rating}) FILTER (WHERE ${messageRatings.rating} IS NOT NULL)::float8`,
			thumbsUpCount: sql<number>`count(*) FILTER (WHERE ${messageRatings.thumbs} = 'up')::int`,
			thumbsDownCount: sql<number>`count(*) FILTER (WHERE ${messageRatings.thumbs} = 'down')::int`,
			...categorySelections,
		})
		.from(messageRatings)
		.innerJoin(messages, eq(messageRatings.messageId, messages.id))
		// Scoped to the user's OWN feedback. Without this, a rating left by anyone else
		// on a message of theirs counted toward their stats — and message ids are handed
		// out by public shares, so a stranger could drag someone's avgRating down.
		.where(and(ownedByUser, isChatModel, eq(messageRatings.userId, userId)))
		.groupBy(messages.modelId, messages.provider);

	const interactionAggregates = await db
		.select({
			modelId: messages.modelId,
			provider: messages.provider,
			regenerateCount: sql<number>`count(*) FILTER (WHERE ${messageInteractions.action} = 'regenerate')::int`,
		})
		.from(messageInteractions)
		.innerJoin(messages, eq(messageInteractions.messageId, messages.id))
		.where(and(ownedByUser, isChatModel, eq(messageInteractions.userId, userId)))
		.groupBy(messages.modelId, messages.provider);

	const key = (modelId: string | null, provider: string | null) => `${modelId}|${provider}`;
	const ratingsByModel = new Map(ratingAggregates.map((r) => [key(r.modelId, r.provider), r]));
	const interactionsByModel = new Map(
		interactionAggregates.map((r) => [key(r.modelId, r.provider), r])
	);

	// TTS/STT rows are maintained incrementally by their own endpoints rather than
	// derived from messages, so they are left untouched here and merged back below.
	const existingStats = await db
		.select()
		.from(modelPerformanceStats)
		.where(eq(modelPerformanceStats.userId, userId));
	const derivedKeys = new Set(messageAggregates.map((m) => key(m.modelId, m.provider)));
	const preserved = existingStats.filter(
		(stat) => !derivedKeys.has(key(stat.modelId, stat.provider))
	);

	const rows = messageAggregates
		.filter((m) => m.modelId && m.provider)
		.map((m) => {
			const k = key(m.modelId, m.provider);
			const ratings = ratingsByModel.get(k);
			const interactions = interactionsByModel.get(k);
			const existing = existingStats.find((s) => key(s.modelId, s.provider) === k);

			return {
				id: existing?.id ?? generateId(),
				userId,
				modelId: m.modelId!,
				provider: m.provider!,
				totalMessages: m.totalMessages,
				totalCost: m.totalCost,
				errorCount: m.errorCount,
				avgTokens: m.avgTokens ?? null,
				avgResponseTime: m.avgResponseTime ?? null,
				avgRating: ratings?.avgRating ?? null,
				thumbsUpCount: ratings?.thumbsUpCount ?? 0,
				thumbsDownCount: ratings?.thumbsDownCount ?? 0,
				accurateCount: ratings?.accurateCount ?? 0,
				helpfulCount: ratings?.helpfulCount ?? 0,
				creativeCount: ratings?.creativeCount ?? 0,
				fastCount: ratings?.fastCount ?? 0,
				costEffectiveCount: ratings?.costEffectiveCount ?? 0,
				regenerateCount: interactions?.regenerateCount ?? 0,
				lastUpdated: new Date(),
			};
		});

	if (rows.length === 0) return preserved;

	// One statement for every model, instead of a select-then-update pair each.
	const written = await db
		.insert(modelPerformanceStats)
		.values(rows)
		.onConflictDoUpdate({
			target: modelPerformanceStats.id,
			set: {
				totalMessages: sql`excluded.total_messages`,
				totalCost: sql`excluded.total_cost`,
				errorCount: sql`excluded.error_count`,
				avgTokens: sql`excluded.avg_tokens`,
				avgResponseTime: sql`excluded.avg_response_time`,
				avgRating: sql`excluded.avg_rating`,
				thumbsUpCount: sql`excluded.thumbs_up_count`,
				thumbsDownCount: sql`excluded.thumbs_down_count`,
				accurateCount: sql`excluded.accurate_count`,
				helpfulCount: sql`excluded.helpful_count`,
				creativeCount: sql`excluded.creative_count`,
				fastCount: sql`excluded.fast_count`,
				costEffectiveCount: sql`excluded.cost_effective_count`,
				regenerateCount: sql`excluded.regenerate_count`,
				lastUpdated: sql`excluded.last_updated`,
			},
		})
		.returning();

	return [...written, ...preserved];
}

export async function deleteModelPerformanceStats(statsId: string): Promise<void> {
	await db.delete(modelPerformanceStats).where(eq(modelPerformanceStats.id, statsId));
}
