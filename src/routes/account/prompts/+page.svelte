<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, useCachedQuery, invalidateQueryPattern } from '$lib/cache/cached-query.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { models } from '$lib/state/models.svelte';
	import type { Prompt, UserEnabledModel } from '$lib/api';
	import { extractVariables, highlightVariables } from '$lib/utils/prompt-variables';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import Trash from '~icons/lucide/trash-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import Save from '~icons/lucide/save';
	import Variable from '~icons/lucide/variable';

	models.init();

	const enabledModelsQuery = useCachedQuery<UserEnabledModel[]>(
		api.user_enabled_models.get_enabled,
		{}
	);
	const enabledModels = $derived(
		Object.values(enabledModelsQuery.data ?? {}) as { id: string; modelId: string }[]
	);

	const promptsQuery = useCachedQuery<Prompt[]>(api.prompts.list, {
		cache_scope: session.current?.user.id ?? 'anonymous',
	});

	let promptsList = $derived(promptsQuery.data ?? []);
	let isLoading = $derived(promptsQuery.isLoading);

	let editingId = $state<string | null>(null);
	let isCreating = $state(false);

	// Form state
	let formName = $state('');
	let formContent = $state('');
	let formDescription = $state('');
	let formDefaultModelId = $state<string>('');
	let formDefaultWebSearchMode = $state<string>('');
	let formDefaultWebSearchProvider = $state<string>('');
	let formAppendMode = $state<string>('replace');
	let formVariables = $state<Array<{ name: string; defaultValue?: string; description?: string }>>(
		[]
	);
	let isSubmitting = $state(false);

	// Auto-detect variables from content and sync with form variables
	// Using $derived to avoid effect_update_depth_exceeded
	let prevFormContent = $state('');

	$effect(() => {
		// Only run when formContent changes, not when formVariables changes
		if (formContent === prevFormContent) return;
		prevFormContent = formContent;

		const detected = extractVariables(formContent);
		const existing = new Map(formVariables.map((v) => [v.name, v]));
		const detectedNames = new Set(detected.map((v) => v.name));

		// Build new variables array: keep existing ones that are still detected, add new ones
		const newVariables: Array<{ name: string; defaultValue?: string; description?: string }> = [];

		for (const v of detected) {
			const existingVar = existing.get(v.name);
			if (existingVar) {
				// Keep existing description/default, but update defaultValue from content if not manually set
				newVariables.push(existingVar);
			} else {
				// New variable
				newVariables.push({ name: v.name, defaultValue: v.defaultValue, description: '' });
			}
		}

		formVariables = newVariables;
	});

	function startEdit(prompt: Prompt) {
		editingId = prompt.id;
		formName = prompt.name;
		formContent = prompt.content;
		formDescription = prompt.description ?? '';
		formDefaultModelId = prompt.defaultModelId ?? '';
		formDefaultWebSearchMode = prompt.defaultWebSearchMode ?? '';
		formDefaultWebSearchProvider = prompt.defaultWebSearchProvider ?? '';
		formAppendMode = prompt.appendMode ?? 'replace';
		formVariables = prompt.variables ?? [];
		isCreating = false;
	}

	function startCreate() {
		editingId = null;
		formName = '';
		formContent = '';
		formDescription = '';
		formDefaultModelId = '';
		formDefaultWebSearchMode = '';
		formDefaultWebSearchProvider = '';
		formAppendMode = 'replace';
		formVariables = [];
		isCreating = true;
	}

	function cancelForm() {
		editingId = null;
		isCreating = false;
		formName = '';
		formContent = '';
		formDescription = '';
		formDefaultModelId = '';
		formDefaultWebSearchMode = '';
		formDefaultWebSearchProvider = '';
		formAppendMode = 'replace';
		formVariables = [];
		if (page.url.searchParams.has('create')) {
			goto('/account/prompts', { replaceState: true });
		}
	}

	// Auto-open create form when navigating with ?create=true
	$effect(() => {
		if (page.url.searchParams.get('create') === 'true' && !isCreating && !editingId) {
			startCreate();
		}
	});

	async function handleSubmit() {
		if (!formName || !formContent) return;

		isSubmitting = true;
		try {
			const payload = {
				name: formName,
				content: formContent,
				description: formDescription || undefined,
				variables: formVariables.length > 0 ? formVariables : undefined,
				defaultModelId: formDefaultModelId || undefined,
				defaultWebSearchMode: formDefaultWebSearchMode || undefined,
				defaultWebSearchProvider: formDefaultWebSearchProvider || undefined,
				appendMode: formAppendMode as 'replace' | 'append' | 'prepend',
			};

			if (isCreating) {
				const res = await fetch(api.prompts.create.url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				});
				if (!res.ok) throw new Error('Failed to create');
			} else if (editingId) {
				const res = await fetch(`${api.prompts.list.url}/${editingId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						...payload,
						defaultModelId: formDefaultModelId || null,
						defaultWebSearchMode: formDefaultWebSearchMode || null,
						defaultWebSearchProvider: formDefaultWebSearchProvider || null,
						variables: formVariables.length > 0 ? formVariables : null,
					}),
				});
				if (!res.ok) throw new Error('Failed to update');
			}

			invalidateQueryPattern(api.prompts.list.url);
			cancelForm();
		} catch (e) {
			console.error(e);
			alert('Error saving prompt');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Are you sure you want to delete this prompt?')) return;

		try {
			const res = await fetch(`${api.prompts.list.url}/${id}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete');
			invalidateQueryPattern(api.prompts.list.url);
		} catch (e) {
			console.error(e);
			alert('Error deleting prompt');
		}
	}

	function updateVariable(
		index: number,
		field: 'defaultValue' | 'description',
		value: string
	) {
		formVariables = formVariables.map((v, i) =>
			i === index ? { ...v, [field]: value || undefined } : v
		);
	}
</script>

<svelte:head>
	<title>Prompts | nanochat</title>
</svelte:head>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold tracking-tight">Prompts</h1>
		<p class="text-muted-foreground text-sm">
			Create reusable prompt templates with variables. Use
			<kbd class="bg-muted rounded px-1 text-xs">Ctrl+P</kbd>
			in chat to quickly apply them.
		</p>
	</div>
	{#if !isCreating && !editingId}
		<Button onclick={startCreate} size="sm" class="gap-2">
			<Plus class="size-4" />
			Create New
		</Button>
	{/if}
</div>

<div class="mt-6 flex flex-col gap-6">
	{#if isCreating || editingId}
		<section class="flex flex-col gap-3">
			<div class="flex flex-col gap-0.5">
				<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
					{isCreating ? 'Create Prompt' : 'Edit Prompt'}
				</h2>
				<p class="text-muted-foreground text-xs">
					{isCreating
						? 'Create a new reusable prompt template.'
						: 'Update your prompt template.'}
				</p>
			</div>
			<div class="bg-card border-border flex flex-col gap-6 rounded-lg border p-5">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label for="name" class="text-sm font-medium">Name</Label>
						<Input
							id="name"
							bind:value={formName}
							placeholder="e.g. Summarize Article"
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="description" class="text-sm font-medium">Description (optional)</Label>
						<Input
							id="description"
							bind:value={formDescription}
							placeholder="Brief description of what this prompt does"
						/>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="content" class="text-sm font-medium">Prompt Content</Label>
					<Textarea
						id="content"
						bind:value={formContent}
						placeholder={'Summarize the following text in {{style}} style:\n\n{{text}}'}
						class="min-h-[200px] w-full resize font-mono leading-relaxed"
					/>
					<div class="text-muted-foreground space-y-1 text-xs">
						<p>
							Use <code class="text-primary">{'{{variable_name}}'}</code> for user-defined variables that
							will be filled in when using the prompt.
						</p>
						<p>
							Use <code class="text-primary">{'{{variable_name:default}}'}</code> to provide a default
							value.
						</p>
						<details class="mt-2">
							<summary class="hover:text-foreground cursor-pointer transition-colors">
								System variables (auto-substituted)
							</summary>
							<div class="bg-muted/40 mt-2 space-y-1 rounded-md p-3 font-mono text-xs">
								<div><code class="text-primary">{'{cur_date}'}</code> - Current date (YYYY-MM-DD)</div>
								<div><code class="text-primary">{'{cur_time}'}</code> - Current time (HH:MM:SS)</div>
								<div><code class="text-primary">{'{cur_datetime}'}</code> - Current date and time</div>
								<div><code class="text-primary">{'{user_name}'}</code> - Your name</div>
							</div>
						</details>
					</div>
				</div>

				{#if formVariables.length > 0}
					<div class="flex flex-col gap-3">
						<div class="flex items-center gap-2">
							<Variable class="text-primary size-4" />
							<Label class="text-sm font-medium">Detected Variables</Label>
						</div>
						<div class="border-border flex flex-col gap-4 rounded-lg border p-4">
							{#each formVariables as variable, index (variable.name)}
								<div class="grid gap-3 sm:grid-cols-3">
									<div class="flex flex-col gap-1">
										<Label class="text-muted-foreground text-xs">Variable Name</Label>
										<div
											class="bg-background text-foreground rounded border px-3 py-2 font-mono text-sm"
										>
											{variable.name}
										</div>
									</div>
									<div class="flex flex-col gap-1">
										<Label class="text-muted-foreground text-xs">Default Value</Label>
										<Input
											value={variable.defaultValue ?? ''}
											oninput={(e) =>
												updateVariable(index, 'defaultValue', e.currentTarget.value)}
											placeholder="Optional default"
											class="h-9 text-sm"
										/>
									</div>
									<div class="flex flex-col gap-1">
										<Label class="text-muted-foreground text-xs">Description</Label>
										<Input
											value={variable.description ?? ''}
											oninput={(e) =>
												updateVariable(index, 'description', e.currentTarget.value)}
											placeholder="Optional description"
											class="h-9 text-sm"
										/>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Default settings -->
				<div class="border-border flex flex-col gap-3 border-t pt-5">
					<div class="flex flex-col gap-0.5">
						<h3 class="text-sm font-medium">Default Settings</h3>
						<p class="text-muted-foreground text-xs">
							These settings will be applied when you use this prompt.
						</p>
					</div>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div class="flex flex-col gap-2">
							<Label for="appendMode" class="text-sm font-medium">Insert Mode</Label>
							<select
								id="appendMode"
								bind:value={formAppendMode}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="replace">Replace input</option>
								<option value="prepend">Prepend to input</option>
								<option value="append">Append to input</option>
							</select>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="defaultModel" class="text-sm font-medium">Default Model</Label>
							<select
								id="defaultModel"
								bind:value={formDefaultModelId}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								{#each enabledModels as model (model.id)}
									<option value={model.modelId}>
										{model.modelId.split('/').pop() ?? model.modelId}
									</option>
								{/each}
							</select>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="defaultSearchMode" class="text-sm font-medium">Web Search</Label>
							<select
								id="defaultSearchMode"
								bind:value={formDefaultWebSearchMode}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								<option value="off">Off</option>
								<option value="standard">Standard</option>
								<option value="deep">Deep</option>
							</select>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="defaultSearchProvider" class="text-sm font-medium">Search Provider</Label>
							<select
								id="defaultSearchProvider"
								bind:value={formDefaultWebSearchProvider}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								<option value="linkup">Linkup</option>
								<option value="tavily">Tavily</option>
								<option value="exa">Exa</option>
								<option value="kagi">Kagi</option>
								<option value="perplexity">Perplexity</option>
								<option value="valyu">Valyu</option>
								<option value="brave">Brave</option>
								<option value="brave-pro">Brave Pro</option>
								<option value="brave-research">Brave Research</option>
							</select>
						</div>
					</div>
				</div>

				<div class="border-border flex justify-end gap-3 border-t pt-4">
					<Button variant="ghost" onclick={cancelForm} disabled={isSubmitting}>Cancel</Button>
					<Button
						onclick={handleSubmit}
						disabled={isSubmitting || !formName || !formContent}
						class="min-w-[100px]"
					>
						{#if isSubmitting}
							<LoaderCircle class="mr-2 size-4 animate-spin" />
							Saving...
						{:else}
							<Save class="mr-2 size-4" />
							Save
						{/if}
					</Button>
				</div>
			</div>
		</section>
	{/if}

	<section class="flex flex-col gap-3">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
				Your Prompts
			</h2>
			<p class="text-muted-foreground text-xs">All of your saved prompt templates.</p>
		</div>

		{#if isLoading}
			<div class="flex justify-center p-8">
				<LoaderCircle class="text-muted-foreground size-6 animate-spin" />
			</div>
		{:else if promptsList.length === 0 && !isCreating}
			<div
				class="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm"
			>
				No prompts yet. Create one to get started.
			</div>
		{:else}
			<div class="bg-card border-border divide-border divide-y rounded-lg border">
				{#each promptsList as prompt (prompt.id)}
					<div
						class="flex flex-col gap-3 p-5 {editingId === prompt.id
							? 'bg-primary/5'
							: ''}"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium">{prompt.name}</span>
									{#if prompt.variables && prompt.variables.length > 0}
										<span
											class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
										>
											{prompt.variables.length} variable{prompt.variables.length > 1 ? 's' : ''}
										</span>
									{/if}
								</div>
								{#if prompt.description}
									<p class="text-muted-foreground text-sm">{prompt.description}</p>
								{/if}
							</div>
							{#if !isCreating && !editingId}
								<div class="flex gap-1">
									<Button
										variant="ghost"
										size="icon"
										class="size-8"
										onclick={() => startEdit(prompt)}
									>
										<Pencil class="size-4" />
										<span class="sr-only">Edit</span>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="text-muted-foreground hover:text-destructive size-8"
										onclick={() => handleDelete(prompt.id)}
									>
										<Trash class="size-4" />
										<span class="sr-only">Delete</span>
									</Button>
								</div>
							{/if}
						</div>
						<p
							class="text-muted-foreground bg-muted/40 border-border line-clamp-3 rounded-md border p-3 font-mono text-sm"
						>
							{prompt.content}
						</p>
						{#if prompt.defaultModelId || prompt.defaultWebSearchMode || (prompt.appendMode && prompt.appendMode !== 'replace')}
							<div class="text-muted-foreground flex flex-wrap gap-2 text-xs">
								{#if prompt.defaultModelId}
									<span class="bg-muted rounded px-2 py-0.5">
										Model: {prompt.defaultModelId.split('/').pop()}
									</span>
								{/if}
								{#if prompt.defaultWebSearchMode}
									<span class="bg-muted rounded px-2 py-0.5">
										Search: {prompt.defaultWebSearchMode}
									</span>
								{/if}
								{#if prompt.appendMode && prompt.appendMode !== 'replace'}
									<span class="bg-muted rounded px-2 py-0.5">
										{prompt.appendMode === 'prepend' ? 'Prepends' : 'Appends'}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
