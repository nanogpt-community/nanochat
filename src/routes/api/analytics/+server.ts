import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getModelAnalytics } from '$lib/analytics/model-analytics';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const userId = await getAuthenticatedUserId(request);
		const recalculate = url.searchParams.get('recalculate') !== 'false';

		console.log(
			`[analytics] Fetching analytics for user ${userId} (recalculate: ${recalculate})`
		);

		const { stats, insights } = await getModelAnalytics(userId, { recalculate });

		return json({ success: true, stats, insights });
	} catch (err) {
		console.error('[analytics] Error fetching analytics:', err);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to fetch analytics');
	}
};
