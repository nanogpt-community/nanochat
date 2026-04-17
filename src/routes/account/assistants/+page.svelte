<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, useCachedQuery, invalidateQueryPattern } from '$lib/cache/cached-query.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { models } from '$lib/state/models.svelte';
	import { Provider } from '$lib/types';
	import type { Assistant, UserEnabledModel } from '$lib/api';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import Trash from '~icons/lucide/trash-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import X from '~icons/lucide/x';
	import Save from '~icons/lucide/save';
	import Star from '~icons/lucide/star';

	models.init();

	const enabledModelsQuery = useCachedQuery<UserEnabledModel[]>(
		api.user_enabled_models.get_enabled,
		{}
	);
	const enabledModels = $derived(
		Object.values(enabledModelsQuery.data ?? {}) as { id: string; modelId: string }[]
	);

	const assistantsQuery = useCachedQuery<Assistant[]>(api.assistants.list, {
		cache_scope: session.current?.user.id ?? 'anonymous',
	});

	let assistants = $derived(assistantsQuery.data ?? []);
	let isLoading = $derived(assistantsQuery.isLoading);

	let editingId = $state<string | null>(null);
	let isCreating = $state(false);

	let formName = $state('');
	let formSystemPrompt = $state('');
	let formDefaultModelId = $state<string>('');
	let formDefaultWebSearchMode = $state<string>('');
	let formDefaultWebSearchProvider = $state<string>('');
	let formDefaultWebSearchExaDepth = $state<string>('');
	let formDefaultWebSearchContextSize = $state<string>('');
	let formDefaultWebSearchKagiSource = $state<string>('');
	let formDefaultWebSearchValyuSearchType = $state<string>('');
	let isSubmitting = $state(false);

	function startEdit(assistant: any) {
		editingId = assistant.id;
		formName = assistant.name;
		formSystemPrompt = assistant.systemPrompt;
		formDefaultModelId = assistant.defaultModelId ?? '';
		formDefaultWebSearchMode = assistant.defaultWebSearchMode ?? '';
		formDefaultWebSearchProvider = assistant.defaultWebSearchProvider ?? '';
		formDefaultWebSearchExaDepth = assistant.defaultWebSearchExaDepth ?? '';
		formDefaultWebSearchContextSize = assistant.defaultWebSearchContextSize ?? '';
		formDefaultWebSearchKagiSource = assistant.defaultWebSearchKagiSource ?? '';
		formDefaultWebSearchValyuSearchType = assistant.defaultWebSearchValyuSearchType ?? '';
		isCreating = false;
	}

	function startCreate() {
		editingId = null;
		formName = '';
		formSystemPrompt = '';
		formDefaultModelId = '';
		formDefaultWebSearchMode = '';
		formDefaultWebSearchProvider = '';
		formDefaultWebSearchExaDepth = '';
		formDefaultWebSearchContextSize = '';
		formDefaultWebSearchKagiSource = '';
		formDefaultWebSearchValyuSearchType = '';
		isCreating = true;
	}

	function cancelForm() {
		editingId = null;
		isCreating = false;
		formName = '';
		formSystemPrompt = '';
		formDefaultModelId = '';
		formDefaultWebSearchMode = '';
		formDefaultWebSearchProvider = '';
		formDefaultWebSearchExaDepth = '';
		formDefaultWebSearchContextSize = '';
		formDefaultWebSearchKagiSource = '';
		formDefaultWebSearchValyuSearchType = '';
		// Clear the create query param if present
		if (page.url.searchParams.has('create')) {
			goto('/account/assistants', { replaceState: true });
		}
	}

	// Auto-open create form when navigating with ?create=true
	$effect(() => {
		if (page.url.searchParams.get('create') === 'true' && !isCreating && !editingId) {
			startCreate();
		}
	});

	async function handleSubmit() {
		if (!formName) return;

		isSubmitting = true;
		try {
			if (isCreating) {
				const res = await fetch(api.assistants.create.url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formName,
						systemPrompt: formSystemPrompt,
						defaultModelId: formDefaultModelId || undefined,
						defaultWebSearchMode: formDefaultWebSearchMode || undefined,
						defaultWebSearchProvider: formDefaultWebSearchProvider || undefined,
						defaultWebSearchExaDepth: formDefaultWebSearchExaDepth || undefined,
						defaultWebSearchContextSize: formDefaultWebSearchContextSize || undefined,
						defaultWebSearchKagiSource: formDefaultWebSearchKagiSource || undefined,
						defaultWebSearchValyuSearchType: formDefaultWebSearchValyuSearchType || undefined,
					}),
				});
				if (!res.ok) throw new Error('Failed to create');
			} else if (editingId) {
				const res = await fetch(`${api.assistants.list.url}/${editingId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formName,
						systemPrompt: formSystemPrompt,
						defaultModelId: formDefaultModelId || null,
						defaultWebSearchMode: formDefaultWebSearchMode || null,
						defaultWebSearchProvider: formDefaultWebSearchProvider || null,
						defaultWebSearchExaDepth: formDefaultWebSearchExaDepth || null,
						defaultWebSearchContextSize: formDefaultWebSearchContextSize || null,
						defaultWebSearchKagiSource: formDefaultWebSearchKagiSource || null,
						defaultWebSearchValyuSearchType: formDefaultWebSearchValyuSearchType || null,
					}),
				});
				if (!res.ok) throw new Error('Failed to update');
			}

			invalidateQueryPattern(api.assistants.list.url);
			cancelForm();
		} catch (e) {
			console.error(e);
			alert('Error saving assistant');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Are you sure you want to delete this assistant?')) return;

		try {
			const res = await fetch(`${api.assistants.list.url}/${id}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete');
			invalidateQueryPattern(api.assistants.list.url);
		} catch (e) {
			console.error(e);
			alert('Error deleting assistant');
		}
	}

	async function handleSetDefault(id: string) {
		try {
			const res = await fetch(`${api.assistants.list.url}/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'setDefault' }),
			});
			if (!res.ok) throw new Error('Failed to set default');
			invalidateQueryPattern(api.assistants.list.url);
		} catch (e) {
			console.error(e);
			alert('Error setting default assistant');
		}
	}
</script>

<svelte:head>
	<title>Assistants | nanochat</title>
</svelte:head>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold tracking-tight">Assistants</h1>
		<p class="text-muted-foreground text-sm">
			Create and manage system prompts to customize your AI assistant's persona and behavior.
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
					{isCreating ? 'Create Assistant' : 'Edit Assistant'}
				</h2>
				<p class="text-muted-foreground text-xs">
					{isCreating
						? 'Set up a new AI assistant with a custom persona.'
						: "Update your assistant's name and system prompt."}
				</p>
			</div>
			<div class="bg-card border-border flex flex-col gap-6 rounded-lg border p-5">
				<div class="flex flex-col gap-2">
					<Label for="name" class="text-sm font-medium">Name</Label>
					<Input
						id="name"
						bind:value={formName}
						placeholder="e.g. Coding Expert"
					/>
					<p class="text-muted-foreground text-xs">Give your assistant a memorable name.</p>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="prompt" class="text-sm font-medium">System Prompt</Label>
					<Textarea
						id="prompt"
						bind:value={formSystemPrompt}
						placeholder="You are a helpful assistant that..."
						class="min-h-[180px] w-full resize leading-relaxed"
					/>
					<div class="text-muted-foreground flex flex-col gap-1 text-xs">
						<p>Define your assistant's personality, expertise, and how it should respond.</p>
						<details class="mt-1">
							<summary class="hover:text-foreground cursor-pointer transition-colors"
								>Available variables</summary
							>
							<div class="bg-muted/30 mt-2 flex flex-col gap-1 rounded-md p-3 font-mono text-xs">
								<div>
									<code class="text-primary">{'{cur_date}'}</code> - Current date (YYYY-MM-DD)
								</div>
								<div>
									<code class="text-primary">{'{cur_time}'}</code> - Current time (HH:MM:SS)
								</div>
								<div>
									<code class="text-primary">{'{cur_datetime}'}</code> - Current date and time (ISO
									format)
								</div>
								<div>
									<code class="text-primary">{'{model_name}'}</code> - Name of the AI model
								</div>
								<div><code class="text-primary">{'{model_id}'}</code> - ID of the AI model</div>
								<div>
									<code class="text-primary">{'{provider}'}</code> - Provider name (e.g., 'nanogpt')
								</div>
								<div>
									<code class="text-primary">{'{user_name}'}</code> - Name of the current user
								</div>
							</div>
						</details>
					</div>
				</div>

				<div class="border-border flex flex-col gap-4 border-t pt-5">
					<div class="flex flex-col gap-0.5">
						<h3 class="text-sm font-medium">Default Settings</h3>
						<p class="text-muted-foreground text-xs">
							These settings will be applied automatically when you switch to this assistant.
						</p>
					</div>

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="flex flex-col gap-2">
							<Label for="defaultModel" class="text-sm font-medium">Default Model</Label>
							<select
								id="defaultModel"
								bind:value={formDefaultModelId}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								{#each enabledModels as model (model.id)}
									<option value={model.modelId}
										>{model.modelId.split('/').pop() ?? model.modelId}</option
									>
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

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="flex flex-col gap-2">
							<Label for="defaultExaDepth" class="text-sm font-medium">Exa Depth</Label>
							<select
								id="defaultExaDepth"
								bind:value={formDefaultWebSearchExaDepth}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								<option value="fast">Fast</option>
								<option value="auto">Auto</option>
								<option value="neural">Neural</option>
								<option value="deep">Deep</option>
							</select>
							<p class="text-muted-foreground text-xs">For Exa provider only</p>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="defaultContextSize" class="text-sm font-medium">Context Size</Label>
							<select
								id="defaultContextSize"
								bind:value={formDefaultWebSearchContextSize}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
							</select>
							<p class="text-muted-foreground text-xs">Search result context amount</p>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="defaultKagiSource" class="text-sm font-medium">Kagi Source</Label>
							<select
								id="defaultKagiSource"
								bind:value={formDefaultWebSearchKagiSource}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								<option value="web">Web</option>
								<option value="news">News</option>
								<option value="search">Search</option>
							</select>
							<p class="text-muted-foreground text-xs">For Kagi provider only</p>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="flex flex-col gap-2">
							<Label for="defaultValyuSearchType" class="text-sm font-medium"
								>Valyu Search Type</Label
							>
							<select
								id="defaultValyuSearchType"
								bind:value={formDefaultWebSearchValyuSearchType}
								class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none"
							>
								<option value="">None</option>
								<option value="all">All (web + proprietary)</option>
								<option value="web">Web only</option>
							</select>
							<p class="text-muted-foreground text-xs">For Valyu provider only</p>
						</div>
					</div>
				</div>

				<div class="border-border flex justify-end gap-3 border-t pt-4">
					<Button variant="ghost" onclick={cancelForm} disabled={isSubmitting}>Cancel</Button>
					<Button
						onclick={handleSubmit}
						disabled={isSubmitting || !formName}
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
				Your Assistants
			</h2>
			<p class="text-muted-foreground text-xs">
				Switch between personas or set a default for new chats.
			</p>
		</div>

		{#if isLoading}
			<div class="flex justify-center p-8">
				<LoaderCircle class="text-muted-foreground size-6 animate-spin" />
			</div>
		{:else if assistants.length === 0}
			<div
				class="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm"
			>
				No assistants yet. Create one to get started.
			</div>
		{:else}
			<div class="bg-card border-border divide-border divide-y rounded-lg border">
				{#each assistants as assistant (assistant.id)}
					<div
						class="flex flex-col gap-3 p-5 {editingId === assistant.id
							? 'bg-primary/5'
							: ''}"
					>
						<div class="flex items-center justify-between gap-4">
							<div class="flex min-w-0 items-center gap-2">
								<span class="truncate text-base font-semibold">{assistant.name}</span>
								{#if assistant.isDefault}
									<span
										class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
										>Default</span
									>
								{/if}
							</div>
							{#if !isCreating && !editingId}
								<div class="flex gap-1">
									{#if !assistant.isDefault}
										<Button
											variant="ghost"
											size="icon"
											class="text-muted-foreground size-8 hover:bg-amber-500/10 hover:text-amber-500"
											onclick={() => handleSetDefault(assistant.id)}
											title="Set as default"
										>
											<Star class="size-4" />
											<span class="sr-only">Set as Default</span>
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="icon"
										class="hover:bg-primary/10 hover:text-primary size-8"
										onclick={() => startEdit(assistant)}
									>
										<Pencil class="size-4" />
										<span class="sr-only">Edit</span>
									</Button>
									{#if !assistant.isDefault}
										<Button
											variant="ghost"
											size="icon"
											class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 size-8"
											onclick={() => handleDelete(assistant.id)}
										>
											<Trash class="size-4" />
											<span class="sr-only">Delete</span>
										</Button>
									{/if}
								</div>
							{/if}
						</div>
						{#if assistant.systemPrompt}
							<p
								class="text-muted-foreground bg-muted/30 border-border line-clamp-3 rounded-md border p-3 font-mono text-sm"
							>
								{assistant.systemPrompt}
							</p>
						{:else}
							<p class="text-muted-foreground/60 text-sm italic">No system prompt configured</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
