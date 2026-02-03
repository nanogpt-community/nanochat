import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import {
	getUserSettings,
	updateUserSettings,
	incrementFreeMessageCount,
	getOrCreateUserSettings,
} from '$lib/db/queries';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { db } from '$lib/db';
import { scheduledTasks } from '$lib/db/schema';
import { computeNextRunAt } from '$lib/backend/scheduler';

function normalizeTimezone(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (trimmed.length === 0) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
		return trimmed;
	} catch {
		return 'UTC';
	}
}

// GET - get user settings
export const GET: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const settings = await getOrCreateUserSettings(userId);
	return json(settings);
};

// POST - update user settings
export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const body = await request.json();
	const { action } = body;

	switch (action) {
		case 'update': {
			const existingSettings = await getUserSettings(userId);
			const previousTimezone = normalizeTimezone(existingSettings?.timezone) ?? 'UTC';

			const updateData: Parameters<typeof updateUserSettings>[1] = {
				privacyMode: body.privacyMode,
				contextMemoryEnabled: body.contextMemoryEnabled,
				persistentMemoryEnabled: body.persistentMemoryEnabled,
				youtubeTranscriptsEnabled: body.youtubeTranscriptsEnabled,
				followUpQuestionsEnabled: body.followUpQuestionsEnabled,
				suggestedPromptsEnabled: body.suggestedPromptsEnabled,
				webScrapingEnabled: body.webScrapingEnabled,
				mcpEnabled: body.mcpEnabled,
				karakeepUrl: body.karakeepUrl,
				karakeepApiKey: body.karakeepApiKey,
				theme: body.theme,
				titleModelId: body.titleModelId,
				titleProviderId: body.titleProviderId,
				followUpModelId: body.followUpModelId,
				followUpProviderId: body.followUpProviderId,
			};

			const normalizedTimezone = normalizeTimezone(body.timezone);
			if (normalizedTimezone !== undefined) {
				updateData.timezone = normalizedTimezone;
			}

			const settings = await updateUserSettings(userId, updateData);

			if (normalizedTimezone && normalizedTimezone !== previousTimezone) {
				const now = new Date();
				const cronTasks = await db.query.scheduledTasks.findMany({
					where: and(
						eq(scheduledTasks.userId, userId),
						eq(scheduledTasks.scheduleType, 'cron'),
						eq(scheduledTasks.enabled, true)
					),
				});

				await Promise.all(
					cronTasks.map(async (task) => {
						const nextRunAt = computeNextRunAt({
							scheduleType: 'cron',
							cronExpression: task.cronExpression,
							intervalSeconds: task.intervalSeconds,
							runAt: task.runAt,
							referenceDate: now,
							timezone: normalizedTimezone,
						});

						if (!nextRunAt) return;

						await db
							.update(scheduledTasks)
							.set({ nextRunAt, updatedAt: now })
							.where(eq(scheduledTasks.id, task.id));
					})
				);
			}

			return json(settings);
		}

		case 'incrementFreeMessages': {
			await incrementFreeMessageCount(userId);
			return json({ ok: true });
		}

		default:
			return error(400, 'Invalid action');
	}
};
