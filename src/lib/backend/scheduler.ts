import CronExpressionParser from 'cron-parser';
import { and, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { db } from '$lib/db';
import { scheduledTasks, userSettings, type ScheduledTask } from '$lib/db/schema';
import {
	_generateMessageForUser,
	type GenerateMessageRequestBody,
	type GenerateMessageResponse,
} from '../../routes/api/generate-message/+server';

export type ScheduledTaskPayload = Omit<GenerateMessageRequestBody, 'session_token'>;
export type ScheduleType = 'cron' | 'interval' | 'once';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const LOCK_TIMEOUT_MS = 5 * 60_000;
const MAX_TASKS_PER_TICK = 10;
const SCHEDULER_GLOBAL_KEY = '__nanochatSchedulerStarted__';

const schedulerId = `scheduler-${crypto.randomUUID()}`;

function resolveTimezone(timezone: string | null | undefined): string {
	if (!timezone) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
		return timezone;
	} catch {
		return 'UTC';
	}
}

export function computeNextRunAt(args: {
	scheduleType: ScheduleType;
	cronExpression?: string | null;
	intervalSeconds?: number | null;
	runAt?: Date | null;
	referenceDate: Date;
	timezone: string;
}): Date | null {
	const {
		scheduleType,
		cronExpression,
		intervalSeconds,
		runAt,
		referenceDate,
		timezone,
	} = args;

	if (scheduleType === 'once') {
		return runAt ?? null;
	}

	if (scheduleType === 'interval') {
		if (!intervalSeconds || intervalSeconds <= 0) return null;
		return new Date(referenceDate.getTime() + intervalSeconds * 1000);
	}

	if (!cronExpression) return null;

	const resolvedTimezone = resolveTimezone(timezone);

	try {
		const parser = CronExpressionParser as unknown as {
			parse?: (expression: string, options: Record<string, unknown>) => { next: () => { toDate: () => Date } };
			parseExpression?: (expression: string, options: Record<string, unknown>) => {
				next: () => { toDate: () => Date };
			};
		};
		const parseFn = parser.parse ?? parser.parseExpression;
		if (!parseFn) {
			throw new Error('Cron parser does not support parse');
		}
		const interval = parseFn(cronExpression, {
			currentDate: referenceDate,
			tz: resolvedTimezone,
		});
		return interval.next().toDate();
	} catch {
		return null;
	}
}

async function getUserTimezone(userId: string): Promise<string> {
	const settings = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
	});
	return resolveTimezone(settings?.timezone);
}

async function lockTask(
	task: ScheduledTask,
	now: Date,
	{ force }: { force?: boolean } = {}
): Promise<ScheduledTask | null> {
	const lockExpiration = new Date(now.getTime() - LOCK_TIMEOUT_MS);
	const conditions = [
		eq(scheduledTasks.id, task.id),
		or(isNull(scheduledTasks.lockedAt), lt(scheduledTasks.lockedAt, lockExpiration)),
	];

	if (!force) {
		conditions.push(eq(scheduledTasks.enabled, true));
		conditions.push(lte(scheduledTasks.nextRunAt, now));
	}

	const [locked] = await db
		.update(scheduledTasks)
		.set({
			lockedAt: now,
			lockedBy: schedulerId,
			updatedAt: now,
		})
		.where(and(...conditions))
		.returning();

	return locked ?? null;
}

async function releaseTaskLock(taskId: string, now: Date): Promise<void> {
	await db
		.update(scheduledTasks)
		.set({
			lockedAt: null,
			lockedBy: null,
			updatedAt: now,
		})
		.where(eq(scheduledTasks.id, taskId));
}

async function executeScheduledTask(
	task: ScheduledTask,
	now: Date
): Promise<{ status: 'queued' | 'error'; error?: string; result?: GenerateMessageResponse }> {
	let status: 'queued' | 'error' = 'queued';
	let errorMessage: string | undefined;
	let result: GenerateMessageResponse | undefined;

	try {
		const payload = task.payload as ScheduledTaskPayload;
		if (!payload || typeof payload !== 'object') {
			throw new Error('Task payload is missing or invalid');
		}

		result = await _generateMessageForUser({
			args: payload,
			userId: task.userId,
			startTime: Date.now(),
		});
	} catch (error) {
		status = 'error';
		errorMessage = error instanceof Error ? error.message : String(error);
	}

	const timezone = await getUserTimezone(task.userId);
	let nextRunAt: Date | null = task.nextRunAt ?? null;
	let enabled = task.enabled;

	if (task.scheduleType === 'once') {
		enabled = false;
		nextRunAt = null;
	} else if (task.enabled) {
		const referenceDate = now;
		nextRunAt = computeNextRunAt({
			scheduleType: task.scheduleType as ScheduleType,
			cronExpression: task.cronExpression,
			intervalSeconds: task.intervalSeconds,
			runAt: task.runAt,
			referenceDate,
			timezone,
		});

		if (!nextRunAt) {
			enabled = false;
			status = 'error';
			errorMessage = errorMessage ?? 'Invalid schedule configuration';
		}
	}

	await db
		.update(scheduledTasks)
		.set({
			lastRunAt: now,
			lastRunStatus: status,
			lastRunError: errorMessage ?? null,
			nextRunAt,
			enabled,
			lockedAt: null,
			lockedBy: null,
			updatedAt: now,
		})
		.where(eq(scheduledTasks.id, task.id));

	return { status, error: errorMessage, result };
}

export async function runDueScheduledTasks(): Promise<void> {
	const now = new Date();
	const lockExpiration = new Date(now.getTime() - LOCK_TIMEOUT_MS);

	const dueTasks = await db.query.scheduledTasks.findMany({
		where: and(
			eq(scheduledTasks.enabled, true),
			lte(scheduledTasks.nextRunAt, now),
			or(isNull(scheduledTasks.lockedAt), lt(scheduledTasks.lockedAt, lockExpiration))
		),
		orderBy: (tasks, { asc }) => [asc(tasks.nextRunAt)],
		limit: MAX_TASKS_PER_TICK,
	});

	for (const task of dueTasks) {
		const locked = await lockTask(task, now);
		if (!locked) continue;

		try {
			await executeScheduledTask(locked, now);
		} catch {
			await releaseTaskLock(locked.id, new Date());
		}
	}
}

export async function runScheduledTaskNow(taskId: string, userId: string) {
	const task = await db.query.scheduledTasks.findFirst({
		where: and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)),
	});

	if (!task) {
		throw new Error('Scheduled task not found');
	}

	const now = new Date();
	const locked = await lockTask(task, now, { force: true });

	if (!locked) {
		throw new Error('Scheduled task is currently locked');
	}

	return executeScheduledTask(locked, now);
}

export function startScheduler(): void {
	if ((globalThis as Record<string, unknown>)[SCHEDULER_GLOBAL_KEY]) return;
	(globalThis as Record<string, unknown>)[SCHEDULER_GLOBAL_KEY] = true;

	runDueScheduledTasks().catch((error) => {
		console.error('[Scheduler] Initial run failed', error);
	});

	setInterval(() => {
		runDueScheduledTasks().catch((error) => {
			console.error('[Scheduler] Tick failed', error);
		});
	}, DEFAULT_POLL_INTERVAL_MS);
}
