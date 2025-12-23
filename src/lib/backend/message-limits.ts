/**
 * Helper functions for managing daily message limits
 * These limits only apply when users are using the server's API key
 */

import { db, generateId } from '$lib/db';
import { userSettings } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

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

    const currentDate = getCurrentDateString();

    // Get or create user settings
    let settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
    });

    if (!settings) {
        // Create settings record
        const now = new Date();
        const newId = generateId();
        await db.insert(userSettings).values({
            id: newId,
            userId,
            dailyMessagesUsed: 0,
            lastMessageDate: currentDate,
            createdAt: now,
            updatedAt: now,
        });
        settings = await db.query.userSettings.findFirst({
            where: eq(userSettings.userId, userId),
        });
    }

    if (!settings) {
        return { allowed: false, remaining: 0, limit, error: 'Failed to create user settings' };
    }

    // Check if we need to reset the counter (new day)
    let dailyMessagesUsed = settings.dailyMessagesUsed ?? 0;
    if (settings.lastMessageDate !== currentDate) {
        // Reset counter for new day
        dailyMessagesUsed = 0;
        if (incrementCounter) {
            await db
                .update(userSettings)
                .set({
                    dailyMessagesUsed: 0,
                    lastMessageDate: currentDate,
                    updatedAt: new Date(),
                })
                .where(eq(userSettings.id, settings.id));
        }
    }

    // Check if limit exceeded
    if (dailyMessagesUsed >= limit) {
        return {
            allowed: false,
            remaining: 0,
            limit,
            error: `Daily message limit of ${limit} messages reached. Your limit will reset at midnight.`,
        };
    }

    // Increment counter if allowed and requested
    if (incrementCounter) {
        await db
            .update(userSettings)
            .set({
                dailyMessagesUsed: dailyMessagesUsed + 1,
                lastMessageDate: currentDate,
                updatedAt: new Date(),
            })
            .where(eq(userSettings.id, settings.id));
    }

    return {
        allowed: true,
        remaining: limit - dailyMessagesUsed - 1,
        limit,
    };
}
