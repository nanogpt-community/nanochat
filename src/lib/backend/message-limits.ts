/**
 * Helper functions for managing daily message limits
 * These limits only apply when users are using the server's API key
 */

import { db, generateId } from '$lib/db';
import { userSettings } from '$lib/db/schema';
import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';

/**
 * Get the daily message limit from environment variable
 * Returns 0 if not set or invalid (0 = unlimited)
 */
export function getDailyMessageLimit(): number {
    const limitStr = process.env.DAILY_MESSAGE_LIMIT;
    if (!limitStr) return 0;
    const limit = parseInt(limitStr, 10);
    return isNaN(limit) ? 0 : limit;
}

/**
 * Check if subscription-only mode is enabled
 */
export function isSubscriptionOnlyMode(): boolean {
    return process.env.SUBSCRIPTION_MODELS_ONLY === 'true';
}

/**
 * Check if web features should be disabled for server key users
 * Only applies when SUBSCRIPTION_MODELS_ONLY is also true
 */
export function isWebDisabledForServerKey(): boolean {
    return (
        isSubscriptionOnlyMode() &&
        process.env.DISABLE_WEB_ON_SERVER_KEY_WITH_SUBSCRIPTION_ONLY === 'true'
    );
}

/**
 * Get current date as ISO string (YYYY-MM-DD)
 */
function getCurrentDateString(): string {
    return new Date().toISOString().split('T')[0]!;
}

interface DailyLimitResult {
    allowed: boolean;
    remaining: number;
    limit: number;
    error?: string;
}

/**
 * Check if user has exceeded their daily message limit and update the counter
 * Returns whether the user is allowed to send a message
 * 
 * @param userId - The user's ID
 * @param usingServerKey - Whether the user is using the server's API key
 * @param incrementCounter - Whether to increment the counter (set to false for dry-run check)
 */
export async function checkAndUpdateDailyLimit(
    userId: string,
    usingServerKey: boolean,
    incrementCounter: boolean = true
): Promise<DailyLimitResult> {
    const limit = getDailyMessageLimit();

    // If limit is 0 or user is using their own key, no limit applies
    if (limit === 0 || !usingServerKey) {
        return { allowed: true, remaining: Infinity, limit: 0 };
    }

    const today = getCurrentDateString();
    const denied: DailyLimitResult = {
        allowed: false,
        remaining: 0,
        limit,
        error: `Daily message limit of ${limit} messages reached. Your limit will reset at midnight.`,
    };

    const existing = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
        columns: { dailyMessagesUsed: true, lastMessageDate: true },
    });
    if (!existing) {
        const now = new Date();
        await db.insert(userSettings).values({
            id: generateId(),
            userId,
            dailyMessagesUsed: 0,
            lastMessageDate: today,
            createdAt: now,
            updatedAt: now,
        });
    }

    if (!incrementCounter) {
        const used =
            existing && existing.lastMessageDate === today ? (existing.dailyMessagesUsed ?? 0) : 0;
        return used >= limit ? denied : { allowed: true, remaining: limit - used, limit };
    }

    // Consume in one conditional UPDATE. Reading the count, comparing in JS and
    // writing count+1 let N concurrent requests all see the same stale value and
    // all pass; here the day rollover and the limit check are part of the
    // statement, so the row lock serializes them and only `limit` of them win.
    const [row] = await db
        .update(userSettings)
        .set({
            dailyMessagesUsed: sql`CASE WHEN ${userSettings.lastMessageDate} = ${today} THEN COALESCE(${userSettings.dailyMessagesUsed}, 0) + 1 ELSE 1 END`,
            lastMessageDate: today,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(userSettings.userId, userId),
                or(
                    isNull(userSettings.lastMessageDate),
                    ne(userSettings.lastMessageDate, today),
                    isNull(userSettings.dailyMessagesUsed),
                    lt(userSettings.dailyMessagesUsed, limit)
                )
            )
        )
        .returning({ used: userSettings.dailyMessagesUsed });

    if (!row) return denied;
    return { allowed: true, remaining: Math.max(0, limit - (row.used ?? 0)), limit };
}
