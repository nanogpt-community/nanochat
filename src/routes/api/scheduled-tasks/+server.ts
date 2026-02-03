import { json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, generateId } from '$lib/db';
import { scheduledTasks } from '$lib/db/schema';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { computeNextRunAt, type ScheduleType } from '$lib/backend/scheduler';
import { getOrCreateUserSettings } from '$lib/db/queries/user-settings';

const payloadSchema = z
	.object({
		message: z.string().optional(),
		model_id: z.string().min(1),
		assistant_id: z.string().optional(),
		project_id: z.string().optional(),
		conversation_id: z.string().optional(),
		web_search_enabled: z.boolean().optional(),
		web_search_mode: z.enum(['off', 'standard', 'deep']).optional(),
		web_search_provider: z
			.enum(['linkup', 'tavily', 'exa', 'kagi', 'perplexity', 'valyu'])
			.optional(),
		web_search_exa_depth: z.enum(['fast', 'auto', 'neural', 'deep']).optional(),
		web_search_context_size: z.enum(['low', 'medium', 'high']).optional(),
		web_search_kagi_source: z.enum(['web', 'news', 'search']).optional(),
		web_search_valyu_search_type: z.enum(['all', 'web']).optional(),
		images: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
				})
			)
			.optional(),
		documents: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
					fileType: z.enum(['pdf', 'markdown', 'text', 'epub']),
				})
			)
			.optional(),
		reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
		provider_id: z.string().optional(),
		image_params: z.record(z.string(), z.any()).optional(),
		temporary: z.boolean().optional(),
	})
	.refine((data) => data.message !== undefined || data.conversation_id !== undefined, {
		message: 'You must provide a message or conversation_id for scheduled tasks',
	});

const scheduleSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('cron'),
		cron: z.string().min(1),
	}),
	z.object({
		type: z.literal('interval'),
		intervalSeconds: z.number().int().positive(),
	}),
	z.object({
		type: z.literal('once'),
		runAt: z.union([z.string(), z.number(), z.date()]),
	}),
]);

const createSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	enabled: z.boolean().optional(),
	schedule: scheduleSchema,
	payload: payloadSchema,
});

function parseRunAt(runAt: string | number | Date): Date {
	if (runAt instanceof Date) return runAt;
	return new Date(runAt);
}

export async function GET({ request }: RequestEvent) {
	const userId = await getAuthenticatedUserId(request);

	const tasks = await db.query.scheduledTasks.findMany({
		where: eq(scheduledTasks.userId, userId),
		orderBy: (tasks, { desc }) => [desc(tasks.updatedAt)],
	});

	return json(tasks);
}

export async function POST({ request }: RequestEvent) {
	const userId = await getAuthenticatedUserId(request);
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const { name, description, enabled = true, schedule, payload } = parsed.data;

	const scheduleType = schedule.type as ScheduleType;
	const cronExpression = schedule.type === 'cron' ? schedule.cron : null;
	const intervalSeconds = schedule.type === 'interval' ? schedule.intervalSeconds : null;
	const runAt = schedule.type === 'once' ? parseRunAt(schedule.runAt) : null;

	if (schedule.type === 'once' && (!runAt || Number.isNaN(runAt.getTime()))) {
		return json({ error: 'Invalid runAt value' }, { status: 400 });
	}

	const settings = await getOrCreateUserSettings(userId);
	const timezone = settings.timezone ?? 'UTC';
	const now = new Date();
	const nextRunAt = enabled
		? computeNextRunAt({
				scheduleType,
				cronExpression,
				intervalSeconds,
				runAt,
				referenceDate: now,
				timezone,
			})
		: null;

	if (enabled && scheduleType !== 'once' && !nextRunAt) {
		return json({ error: 'Invalid schedule configuration' }, { status: 400 });
	}

	const newTask = {
		id: generateId(),
		userId,
		name,
		description: description ?? null,
		enabled,
		scheduleType,
		cronExpression,
		intervalSeconds,
		runAt,
		payload,
		nextRunAt,
		lastRunAt: null,
		lastRunStatus: null,
		lastRunError: null,
		lockedAt: null,
		lockedBy: null,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(scheduledTasks).values(newTask);

	return json(newTask);
}
