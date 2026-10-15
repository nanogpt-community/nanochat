import { calculateAllModelPerformanceStats } from '#lib/db/queries/model-performance.js';

/**
 * Aggregate model performance stats for a user
 * This can be called periodically (e.g., via cron) or on-demand
 */
export async function aggregateModelPerformanceStats(userId: string): Promise<void> {
	try {
		await calculateAllModelPerformanceStats(userId);
		console.log(`Successfully aggregated stats for user ${userId}`);
	} catch (error) {
		console.error(`Failed to aggregate stats for user ${userId}:`, error);
		throw error;
	}
}

/**
 * Aggregate stats for all users
 * Note: In production, this should be done in batches to avoid memory issues
 */
export async function aggregateAllUsersStats(userIds: string[]): Promise<void> {
	for (const userId of userIds) {
		try {
			await aggregateModelPerformanceStats(userId);
		} catch (error) {
			// Continue with other users even if one fails
			console.error(`Failed to aggregate stats for user ${userId}, continuing...`);
		}
	}
}
