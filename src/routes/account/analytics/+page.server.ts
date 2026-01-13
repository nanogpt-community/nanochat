import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/auth';
import { getModelAnalytics } from '$lib/analytics/model-analytics';

export const load: PageServerLoad = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		throw redirect(302, '/');
	}

	const userId = session.user.id;

	try {
		console.log(`[analytics] Loading analytics for user ${userId}`);

		const { stats, insights } = await getModelAnalytics(userId, { recalculate: true });
		console.log(`[analytics] Calculated stats for ${stats.length} models`);
		console.log(
			`[analytics] Generated insights: ${insights.totalMessages} messages, $${insights.totalCost.toFixed(2)} cost`
		);

		return { stats, insights };
	} catch (err) {
		console.error(`[analytics] Error loading analytics for user ${userId}:`, err);
		// Return empty data on error rather than crashing
		return {
			stats: [],
			insights: {
				totalMessages: 0,
				totalCost: 0,
				avgRating: null,
				mostUsedModel: null,
				bestRatedModel: null,
				mostCostEffective: null,
				fastestModel: null,
			},
		};
	}
};
