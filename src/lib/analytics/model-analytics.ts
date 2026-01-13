import type { ModelPerformanceStats } from '$lib/db/schema';
import {
	calculateAllModelPerformanceStats,
	getModelPerformanceStatsByUser,
} from '$lib/db/queries/model-performance';

export type ModelAnalyticsInsights = {
	totalMessages: number;
	totalCost: number;
	avgRating: number | null;
	mostUsedModel: ModelPerformanceStats | null;
	bestRatedModel: ModelPerformanceStats | null;
	mostCostEffective: ModelPerformanceStats | null;
	fastestModel: ModelPerformanceStats | null;
};

export async function getModelAnalytics(
	userId: string,
	options?: { recalculate?: boolean }
): Promise<{ stats: ModelPerformanceStats[]; insights: ModelAnalyticsInsights }> {
	const recalculate = options?.recalculate ?? true;

	const stats = recalculate
		? await calculateAllModelPerformanceStats(userId)
		: await getModelPerformanceStatsByUser(userId);

	const insights = buildModelAnalyticsInsights(stats);
	return { stats, insights };
}

export function buildModelAnalyticsInsights(
	stats: ModelPerformanceStats[]
): ModelAnalyticsInsights {
	const totalMessages = stats.reduce((sum, s) => sum + s.totalMessages, 0);
	const totalCost = stats.reduce((sum, s) => {
		const cost = s.totalCost;
		if (cost === null || cost === undefined || Number.isNaN(cost)) {
			return sum;
		}
		return sum + cost;
	}, 0);

	const ratedStats = stats.filter((s) => s.avgRating !== null && s.avgRating !== undefined);
	const avgRating =
		ratedStats.length > 0
			? ratedStats.reduce((sum, s) => sum + (s.avgRating ?? 0), 0) / ratedStats.length
			: null;

	const mostUsedModel =
		stats.length > 0
			? stats.reduce(
					(prev, current) => (current.totalMessages > prev.totalMessages ? current : prev),
					stats[0]!
				)
			: null;

	const qualifiedModels = stats.filter((s) => s.totalMessages >= 5 && s.avgRating !== null);
	const bestRatedModel =
		qualifiedModels.length > 0
			? qualifiedModels.reduce((prev, current) =>
					(current.avgRating ?? 0) > (prev.avgRating ?? 0) ? current : prev
				)
			: null;

	const modelsWithCost = stats.filter(
		(s) => s.totalMessages >= 5 && s.totalCost > 0 && !Number.isNaN(s.totalCost)
	);
	const mostCostEffective =
		modelsWithCost.length > 0
			? modelsWithCost.reduce((prev, current) => {
					const prevCostPerMsg = prev.totalCost / prev.totalMessages;
					const currentCostPerMsg = current.totalCost / current.totalMessages;
					return currentCostPerMsg < prevCostPerMsg ? current : prev;
				})
			: null;

	const modelsWithSpeed = stats.filter(
		(s) =>
			s.totalMessages >= 5 &&
			s.avgTokens !== null &&
			s.avgTokens !== undefined &&
			s.avgResponseTime !== null &&
			s.avgResponseTime !== undefined &&
			s.avgResponseTime > 0
	);

	const fastestModel =
		modelsWithSpeed.length > 0
			? modelsWithSpeed.reduce((prev, current) => {
					const prevSpeed = (prev.avgTokens ?? 0) / ((prev.avgResponseTime ?? 0) / 1000 || 1);
					const currentSpeed =
						(current.avgTokens ?? 0) / ((current.avgResponseTime ?? 0) / 1000 || 1);
					return currentSpeed > prevSpeed ? current : prev;
				})
			: null;

	return {
		totalMessages,
		totalCost,
		avgRating,
		mostUsedModel,
		bestRatedModel,
		mostCostEffective,
		fastestModel,
	};
}
