<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, useCachedQuery, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { models } from '$lib/state/models.svelte';
	import type { Assistant, Project, ScheduledTask, UserSettings } from '$lib/api';
	import { Provider } from '$lib/types';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input/input.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import Trash from '~icons/lucide/trash-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import Save from '~icons/lucide/save';
	import Play from '~icons/lucide/play';

	models.init();

	const settingsQuery = useCachedQuery<UserSettings>(api.user_settings.get, {});
	const userTimezone = $derived(settingsQuery.data?.timezone ?? 'UTC');

	const tasksQuery = useCachedQuery<ScheduledTask[]>(api.scheduled_tasks.list, {
		session_token: session.current?.session.token ?? '',
	});
	const assistantsQuery = useCachedQuery<Assistant[]>(api.assistants.list, {});
	const projectsQuery = useCachedQuery<Project[]>(api.projects.list, {});

	const tasksList = $derived(tasksQuery.data ?? []);
	const isLoading = $derived(tasksQuery.isLoading);

	const enabledModels = $derived(
		models
			.from(Provider.NanoGPT)
			.filter((m) => m.enabled)
			.map((m) => ({ value: m.id, label: m.name }))
	);

	$effect(() => {
		if (!formModelId && enabledModels.length > 0) {
			formModelId = enabledModels[0]?.value ?? '';
		}
	});

	let editingId = $state<string | null>(null);
	let isSubmitting = $state(false);

	// Form state
	let formName = $state('');
	let formDescription = $state('');
	let formMessage = $state('');
	let formModelId = $state('');
	let formAssistantId = $state('');
	let formProjectId = $state('');
	let formWebSearchMode = $state<'off' | 'standard' | 'deep'>('off');
	let formWebSearchProvider = $state<'linkup' | 'tavily' | 'exa' | 'kagi' | 'perplexity' | 'valyu'>(
		'linkup'
	);
	let formReasoningEffort = $state<'low' | 'medium' | 'high' | ''>('');
	let formEnabled = $state(true);

	type ScheduleType = 'cron' | 'interval' | 'once';
	let formScheduleType = $state<ScheduleType>('cron');
	let formCron = $state('0 9 * * *');
	let formIntervalValue = $state(60);
	let formIntervalUnit = $state<'minutes' | 'hours' | 'days'>('minutes');
	let formRunAt = $state('');

	function startCreate() {
		editingId = null;
		formName = '';
		formDescription = '';
		formMessage = '';
		formModelId = enabledModels[0]?.value ?? '';
		formAssistantId = '';
		formProjectId = '';
		formWebSearchMode = 'off';
		formWebSearchProvider = 'linkup';
		formReasoningEffort = '';
		formEnabled = true;
		formScheduleType = 'cron';
		formCron = '0 9 * * *';
		formIntervalValue = 60;
		formIntervalUnit = 'minutes';
		formRunAt = '';
	}

	function toLocalDatetimeInput(value: string | Date | null | undefined): string {
		if (!value) return '';
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const tz = safeTimezone(userTimezone);
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		});
		const parts = formatter.formatToParts(date);
		const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
		const year = getPart('year');
		const month = getPart('month');
		const day = getPart('day');
		const hour = getPart('hour');
		const minute = getPart('minute');
		return `${year}-${month}-${day}T${hour}:${minute}`;
	}

	function safeTimezone(value: string): string {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
			return value;
		} catch {
			return 'UTC';
		}
	}

	function getTimezoneOffsetMinutes(ts: number, tz: string): number {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		});
		const parts = formatter.formatToParts(new Date(ts));
		const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
		const year = Number(getPart('year'));
		const month = Number(getPart('month'));
		const day = Number(getPart('day'));
		const hour = Number(getPart('hour'));
		const minute = Number(getPart('minute'));
		const second = Number(getPart('second'));
		const utcFromParts = Date.UTC(year, month - 1, day, hour, minute, second);
		return (utcFromParts - ts) / 60000;
	}

	function toUtcIsoFromTimezone(value: string, tz: string): string {
		const match =
			/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/.exec(value.trim()) ?? null;
		if (!match) return '';
		const [, year, month, day, hour, minute] = match;
		const base = Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			0
		);
		const tzSafe = safeTimezone(tz);
		const offsetMinutes = getTimezoneOffsetMinutes(base, tzSafe);
		const finalTs = base - offsetMinutes * 60000;
		return new Date(finalTs).toISOString();
	}

	function formatSchedule(task: ScheduledTask): string {
		if (task.scheduleType === 'cron') return `Cron: ${task.cronExpression ?? '—'}`;
		if (task.scheduleType === 'interval') {
			const seconds = task.intervalSeconds ?? 0;
			if (seconds % 86400 === 0) return `Every ${seconds / 86400} day(s)`;
			if (seconds % 3600 === 0) return `Every ${seconds / 3600} hour(s)`;
			return `Every ${Math.max(1, Math.round(seconds / 60))} minute(s)`;
		}
		if (task.scheduleType === 'once') return `Once: ${formatDate(task.runAt)}`;
		return '—';
	}

	function formatDate(value: string | Date | null | undefined): string {
		if (!value) return '—';
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		try {
			return date.toLocaleString('en-US', { timeZone: userTimezone });
		} catch {
			return date.toLocaleString('en-US', { timeZone: 'UTC' });
		}
	}

	function startEdit(task: ScheduledTask) {
		editingId = task.id;
		formName = task.name;
		formDescription = task.description ?? '';
		formMessage = (task.payload as any)?.message ?? '';
		formModelId = (task.payload as any)?.model_id ?? '';
		formAssistantId = (task.payload as any)?.assistant_id ?? '';
		formProjectId = (task.payload as any)?.project_id ?? '';
		formWebSearchMode = ((task.payload as any)?.web_search_mode as typeof formWebSearchMode) ?? 'off';
		formWebSearchProvider =
			((task.payload as any)?.web_search_provider as typeof formWebSearchProvider) ?? 'linkup';
		formReasoningEffort =
			((task.payload as any)?.reasoning_effort as typeof formReasoningEffort) ?? '';
		formEnabled = task.enabled ?? true;

		formScheduleType = task.scheduleType as ScheduleType;
		if (task.scheduleType === 'cron') {
			formCron = task.cronExpression ?? '';
		} else if (task.scheduleType === 'interval') {
			const seconds = task.intervalSeconds ?? 60;
			if (seconds % 86400 === 0) {
				formIntervalUnit = 'days';
				formIntervalValue = Math.max(1, seconds / 86400);
			} else if (seconds % 3600 === 0) {
				formIntervalUnit = 'hours';
				formIntervalValue = Math.max(1, seconds / 3600);
			} else {
				formIntervalUnit = 'minutes';
				formIntervalValue = Math.max(1, Math.round(seconds / 60));
			}
		} else if (task.scheduleType === 'once') {
			formRunAt = toLocalDatetimeInput(task.runAt);
		}
	}

	function cancelForm() {
		editingId = null;
		formName = '';
		formDescription = '';
		formMessage = '';
		formModelId = '';
		formAssistantId = '';
		formProjectId = '';
		formWebSearchMode = 'off';
		formWebSearchProvider = 'linkup';
		formReasoningEffort = '';
		formEnabled = true;
		formScheduleType = 'cron';
		formCron = '0 9 * * *';
		formIntervalValue = 60;
		formIntervalUnit = 'minutes';
		formRunAt = '';

		if (page.url.searchParams.has('create')) {
			goto('/account/schedules', { replaceState: true });
		}
	}

	$effect(() => {
		if (page.url.searchParams.get('create') === 'true' && !editingId) {
			startCreate();
		}
	});

	function intervalSeconds(): number {
		const value = Math.max(1, Number(formIntervalValue));
		switch (formIntervalUnit) {
			case 'days':
				return value * 86400;
			case 'hours':
				return value * 3600;
			default:
				return value * 60;
		}
	}

	function buildSchedule(): { type: ScheduleType; cron?: string; intervalSeconds?: number; runAt?: string } {
		if (formScheduleType === 'cron') {
			return { type: 'cron', cron: formCron.trim() };
		}
		if (formScheduleType === 'interval') {
			return { type: 'interval', intervalSeconds: intervalSeconds() };
		}
		return {
			type: 'once',
			runAt: formRunAt ? toUtcIsoFromTimezone(formRunAt, userTimezone) : '',
		};
	}

	async function handleSubmit() {
		if (!formName || !formMessage || !formModelId) return;
		const schedule = buildSchedule();
		if (schedule.type === 'cron' && !schedule.cron) return;
		if (schedule.type === 'once' && !schedule.runAt) return;

		isSubmitting = true;
		try {
			const payload = {
				message: formMessage,
				model_id: formModelId,
				assistant_id: formAssistantId || undefined,
				project_id: formProjectId || undefined,
				web_search_mode: formWebSearchMode,
				web_search_provider: formWebSearchMode === 'off' ? undefined : formWebSearchProvider,
				web_search_enabled: formWebSearchMode !== 'off',
				reasoning_effort: formReasoningEffort || undefined,
			};

			const body = {
				name: formName,
				description: formDescription || undefined,
				enabled: formEnabled,
				schedule,
				payload,
			};

			if (!editingId) {
				const res = await fetch(api.scheduled_tasks.create.url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error('Failed to create schedule');
			} else {
				const res = await fetch(`${api.scheduled_tasks.update.url}/${editingId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error('Failed to update schedule');
			}

			invalidateQueryPattern(api.scheduled_tasks.list.url);
			cancelForm();
		} catch (e) {
			console.error(e);
			alert('Error saving schedule');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Are you sure you want to delete this schedule?')) return;
		try {
			const res = await fetch(`${api.scheduled_tasks.delete.url}/${id}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete');
			invalidateQueryPattern(api.scheduled_tasks.list.url);
		} catch (e) {
			console.error(e);
			alert('Error deleting schedule');
		}
	}

	async function toggleEnabled(task: ScheduledTask) {
		try {
			const res = await fetch(`${api.scheduled_tasks.update.url}/${task.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: !task.enabled }),
			});
			if (!res.ok) throw new Error('Failed to update');
			invalidateQueryPattern(api.scheduled_tasks.list.url);
		} catch (e) {
			console.error(e);
			alert('Error updating schedule');
		}
	}

	async function runNow(task: ScheduledTask) {
		try {
			const res = await fetch(`${api.scheduled_tasks.run.url}/${task.id}/run`, {
				method: 'POST',
			});
			if (!res.ok) throw new Error('Failed to run schedule');
			invalidateQueryPattern(api.scheduled_tasks.list.url);
		} catch (e) {
			console.error(e);
			alert('Error running schedule');
		}
	}
</script>

<svelte:head>
	<title>Schedules | nanochat</title>
</svelte:head>

<h1 class="text-2xl font-bold">Scheduled Tasks</h1>
<h2 class="text-muted-foreground mt-2 text-sm">
	Create cron-style tasks that run in your timezone ({userTimezone}).
</h2>

<div class="mt-6 flex flex-col gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>{editingId ? 'Edit Schedule' : 'Create Schedule'}</Card.Title>
			<Card.Description>Run prompts on a recurring schedule.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<div class="grid gap-2">
				<Label for="schedule-name">Name</Label>
				<Input id="schedule-name" bind:value={formName} placeholder="Daily summary" />
			</div>
			<div class="grid gap-2">
				<Label for="schedule-description">Description (optional)</Label>
				<Textarea
					id="schedule-description"
					bind:value={formDescription}
					rows={2}
					placeholder="Optional notes about this task"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="schedule-message">Prompt</Label>
				<Textarea
					id="schedule-message"
					bind:value={formMessage}
					rows={4}
					placeholder="Write the prompt to run on schedule"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="schedule-model">Model</Label>
				<select
					id="schedule-model"
					class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					bind:value={formModelId}
				>
					<option value="" disabled>Select a model</option>
					{#each enabledModels as model}
						<option value={model.value}>{model.label}</option>
					{/each}
				</select>
			</div>
			<div class="grid gap-2">
				<Label for="schedule-assistant">Assistant (optional)</Label>
				<select
					id="schedule-assistant"
					class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					bind:value={formAssistantId}
				>
					<option value="">None</option>
					{#each assistantsQuery.data ?? [] as assistant}
						<option value={assistant.id}>{assistant.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid gap-2">
				<Label for="schedule-project">Project (optional)</Label>
				<select
					id="schedule-project"
					class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					bind:value={formProjectId}
				>
					<option value="">None</option>
					{#each projectsQuery.data ?? [] as project}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid gap-2">
				<Label for="schedule-search-mode">Web Search</Label>
				<select
					id="schedule-search-mode"
					class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					bind:value={formWebSearchMode}
				>
					<option value="off">Off</option>
					<option value="standard">Standard</option>
					<option value="deep">Deep</option>
				</select>
			</div>
			{#if formWebSearchMode !== 'off'}
				<div class="grid gap-2">
					<Label for="schedule-search-provider">Web Search Provider</Label>
					<select
						id="schedule-search-provider"
						class="border-input bg-background rounded-md border px-3 py-2 text-sm"
						bind:value={formWebSearchProvider}
					>
						<option value="linkup">Linkup</option>
						<option value="tavily">Tavily</option>
						<option value="exa">Exa</option>
						<option value="kagi">Kagi</option>
						<option value="perplexity">Perplexity</option>
						<option value="valyu">Valyu</option>
					</select>
				</div>
			{/if}
			<div class="grid gap-2">
				<Label for="schedule-reasoning">Reasoning Effort</Label>
				<select
					id="schedule-reasoning"
					class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					bind:value={formReasoningEffort}
				>
					<option value="">Default</option>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</div>
			<div class="grid gap-2">
				<Label for="schedule-type">Schedule Type</Label>
				<select
					id="schedule-type"
					class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					bind:value={formScheduleType}
				>
					<option value="cron">Cron Expression</option>
					<option value="interval">Interval</option>
					<option value="once">One-time</option>
				</select>
			</div>
			{#if formScheduleType === 'cron'}
				<div class="grid gap-2">
					<Label for="schedule-cron">Cron Expression</Label>
					<Input
						id="schedule-cron"
						bind:value={formCron}
						placeholder="0 9 * * *"
					/>
				</div>
			{:else if formScheduleType === 'interval'}
				<div class="grid gap-2">
					<Label>Interval</Label>
					<div class="flex items-center gap-2">
						<Input type="number" min="1" bind:value={formIntervalValue} class="w-[120px]" />
						<select
							class="border-input bg-background rounded-md border px-3 py-2 text-sm"
							bind:value={formIntervalUnit}
						>
							<option value="minutes">Minutes</option>
							<option value="hours">Hours</option>
							<option value="days">Days</option>
						</select>
					</div>
				</div>
			{:else}
				<div class="grid gap-2">
					<Label for="schedule-run-at">Run At</Label>
					<Input id="schedule-run-at" type="datetime-local" bind:value={formRunAt} />
				</div>
			{/if}
			<div class="flex items-center gap-2">
				<input id="schedule-enabled" type="checkbox" bind:checked={formEnabled} />
				<Label for="schedule-enabled">Enabled</Label>
			</div>
		</Card.Content>
		<Card.Footer class="flex items-center justify-between">
			<Button variant="ghost" onclick={cancelForm}>Cancel</Button>
			<Button onclick={handleSubmit} disabled={isSubmitting}>
				{#if isSubmitting}
					<LoaderCircle class="mr-2 size-4 animate-spin" />
					Saving...
				{:else}
					<Save class="mr-2 size-4" />
					Save
				{/if}
			</Button>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between">
			<div>
				<Card.Title>Your Schedules</Card.Title>
				<Card.Description>Manage scheduled tasks and runs.</Card.Description>
			</div>
			<Button onclick={startCreate}>
				<Plus class="mr-2 size-4" />
				New
			</Button>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#if isLoading}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="size-4 animate-spin" />
					Loading schedules...
				</div>
			{:else if tasksList.length === 0}
				<p class="text-sm text-muted-foreground">No scheduled tasks yet.</p>
			{:else}
				{#each tasksList as task}
					<div class="border-border rounded-lg border p-4">
						<div class="flex items-start justify-between gap-4">
							<div class="space-y-1">
								<div class="text-base font-semibold">{task.name}</div>
								{#if task.description}
									<div class="text-sm text-muted-foreground">{task.description}</div>
								{/if}
								<div class="text-xs text-muted-foreground">{formatSchedule(task)}</div>
								<div class="text-xs text-muted-foreground">
									Next run: {formatDate(task.nextRunAt)} • Last run: {formatDate(task.lastRunAt)}
								</div>
								{#if task.lastRunStatus === 'error' && task.lastRunError}
									<div class="text-xs text-red-500">Last error: {task.lastRunError}</div>
								{/if}
							</div>
							<div class="flex flex-col gap-2">
								<Button size="sm" variant="outline" onclick={() => toggleEnabled(task)}>
									{task.enabled ? 'Disable' : 'Enable'}
								</Button>
								<Button size="sm" variant="outline" onclick={() => runNow(task)}>
									<Play class="mr-2 size-3" />
									Run now
								</Button>
								<div class="flex gap-2">
									<Button size="icon" variant="ghost" onclick={() => startEdit(task)}>
										<Pencil class="size-4" />
									</Button>
									<Button size="icon" variant="ghost" onclick={() => handleDelete(task.id)}>
										<Trash class="size-4" />
									</Button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
