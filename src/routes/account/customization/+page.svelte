<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { page } from '$app/state';
	import PlusIcon from '~icons/lucide/plus';
	import CopyIcon from '~icons/lucide/copy';
	import { Collapsible } from 'melt/builders';
	import { slide } from 'svelte/transition';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import XIcon from '~icons/lucide/x';
	import { mutate } from '$lib/client/mutation.svelte';
	import { useCachedQuery, api, type QueryResult } from '$lib/cache/cached-query.svelte';
	import type { Doc } from '$lib/db/types';
	import { Input } from '$lib/components/ui/input';
	import Rule from './rule.svelte';
	import ThemeSelector from '$lib/components/account/ThemeSelector.svelte';
	import type { UserSettings } from '$lib/api';
	import { Provider } from '$lib/types';
	import { models } from '$lib/state/models.svelte';
	import { settings as clientSettings } from '$lib/state/settings.svelte';
	import { toast } from 'svelte-sonner';

	const newRuleCollapsible = new Collapsible({
		open: false,
	});

	let creatingRule = $state(false);

	const userRulesQuery: QueryResult<Doc<'user_rules'>[]> = useCachedQuery(api.user_rules.all, {});
	const userSettings = useCachedQuery<UserSettings>(api.user_settings.get, {});
	const availableModels = $derived(models.from(Provider.NanoGPT));

	type ModelProviderInfo = {
		provider: string;
		pricing: {
			inputPer1kTokens: number;
			outputPer1kTokens: number;
		};
		available: boolean;
	};

	type ModelProvidersResponse = {
		canonicalId: string;
		displayName: string;
		supportsProviderSelection: boolean;
		providers: ModelProviderInfo[];
		error?: string;
	};

	let currentTheme = $state(userSettings.data?.theme ?? null);
	let currentThemePrimaryColor = $state(userSettings.data?.themePrimaryColor ?? null);
	let currentThemeAccentColor = $state(userSettings.data?.themeAccentColor ?? null);
	const searchModeOptions = [
		{ value: 'off', label: 'Off' },
		{ value: 'standard', label: 'Standard' },
		{ value: 'deep', label: 'Deep' },
	] as const;
	const searchProviderOptions = [
		{ value: 'linkup', label: 'Linkup' },
		{ value: 'tavily', label: 'Tavily' },
		{ value: 'exa', label: 'Exa' },
		{ value: 'kagi', label: 'Kagi' },
		{ value: 'perplexity', label: 'Perplexity' },
		{ value: 'valyu', label: 'Valyu' },
		{ value: 'brave', label: 'Brave' },
		{ value: 'brave-pro', label: 'Brave Pro' },
		{ value: 'brave-research', label: 'Brave Research' },
	] as const;
	const exaDepthOptions = [
		{ value: 'fast', label: 'Fast' },
		{ value: 'auto', label: 'Auto' },
		{ value: 'neural', label: 'Neural' },
		{ value: 'deep', label: 'Deep' },
	] as const;
	const contextSizeOptions = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
	] as const;
	const kagiSourceOptions = [
		{ value: 'web', label: 'Web' },
		{ value: 'news', label: 'News' },
		{ value: 'search', label: 'Search' },
	] as const;
	const valyuSearchTypeOptions = [
		{ value: 'all', label: 'All Sources' },
		{ value: 'web', label: 'Web Only' },
	] as const;

	let searchForwardModel = $state(clientSettings.modelId ?? '');
	let searchForwardSearchMode = $state(clientSettings.webSearchMode);
	let searchForwardSearchProvider = $state(clientSettings.webSearchProvider);
	let searchForwardModelProviders = $state<ModelProviderInfo[]>([]);
	let searchForwardSupportsProviderSelection = $state(false);
	let searchForwardProvidersLoading = $state(false);

	const searchForwardUrl = $derived.by(() => {
		const params: string[] = [];
		if (searchForwardModel) {
			params.push(`model=${encodeURIComponent(searchForwardModel)}`);
		}
		params.push(`model_provider=${encodeURIComponent(clientSettings.providerId ?? 'auto')}`);
		params.push(`search=${encodeURIComponent(searchForwardSearchMode)}`);
		if (searchForwardSearchMode !== 'off') {
			params.push(`search_provider=${encodeURIComponent(searchForwardSearchProvider)}`);
			params.push(`search_context_size=${encodeURIComponent(clientSettings.webSearchContextSize)}`);
			if (searchForwardSearchProvider === 'exa') {
				params.push(`search_exa_depth=${encodeURIComponent(clientSettings.webSearchExaDepth)}`);
			}
			if (searchForwardSearchProvider === 'kagi') {
				params.push(`search_kagi_source=${encodeURIComponent(clientSettings.webSearchKagiSource)}`);
			}
			if (searchForwardSearchProvider === 'valyu') {
				params.push(
					`search_valyu_search_type=${encodeURIComponent(clientSettings.webSearchValyuSearchType)}`
				);
			}
		}
		params.push('q=%s');
		return `${page.url.origin}/chat?${params.join('&')}`;
	});

	async function fetchSearchForwardModelProviders(modelId: string) {
		if (!modelId) {
			searchForwardSupportsProviderSelection = false;
			searchForwardModelProviders = [];
			clientSettings.providerId = undefined;
			return;
		}

		searchForwardProvidersLoading = true;
		try {
			const response = await fetch(`/api/model-providers?modelId=${encodeURIComponent(modelId)}`);
			if (!response.ok) {
				searchForwardSupportsProviderSelection = false;
				searchForwardModelProviders = [];
				clientSettings.providerId = undefined;
				return;
			}

			const data: ModelProvidersResponse = await response.json();
			if (data.error) {
				searchForwardSupportsProviderSelection = false;
				searchForwardModelProviders = [];
				clientSettings.providerId = undefined;
				return;
			}

			searchForwardSupportsProviderSelection = data.supportsProviderSelection;
			searchForwardModelProviders = data.providers?.filter((provider) => provider.available) ?? [];

			if (
				clientSettings.providerId &&
				!searchForwardModelProviders.some(
					(provider) => provider.provider === clientSettings.providerId
				)
			) {
				clientSettings.providerId = undefined;
			}
		} catch (error) {
			console.error('Failed to fetch model providers', error);
			searchForwardSupportsProviderSelection = false;
			searchForwardModelProviders = [];
			clientSettings.providerId = undefined;
		} finally {
			searchForwardProvidersLoading = false;
		}
	}

	$effect(() => {
		if (userSettings.data?.theme !== undefined) {
			if (currentTheme !== userSettings.data.theme) {
				currentTheme = userSettings.data.theme;
			}
			if (currentThemePrimaryColor !== (userSettings.data.themePrimaryColor ?? null)) {
				currentThemePrimaryColor = userSettings.data.themePrimaryColor ?? null;
			}
			if (currentThemeAccentColor !== (userSettings.data.themeAccentColor ?? null)) {
				currentThemeAccentColor = userSettings.data.themeAccentColor ?? null;
			}
		}
		if (searchForwardModel && !availableModels.some((model) => model.id === searchForwardModel)) {
			searchForwardModel = availableModels[0]?.id ?? '';
		}
		if (!searchForwardModel && availableModels.length > 0) {
			searchForwardModel = availableModels[0]!.id;
		}
		if (searchForwardModel) {
			if (clientSettings.modelId !== searchForwardModel) {
				clientSettings.modelId = searchForwardModel;
			}
		}
		if (searchForwardSearchMode !== clientSettings.webSearchMode) {
			searchForwardSearchMode = clientSettings.webSearchMode;
		}
		if (searchForwardSearchProvider !== clientSettings.webSearchProvider) {
			searchForwardSearchProvider = clientSettings.webSearchProvider;
		}
	});

	$effect(() => {
		void fetchSearchForwardModelProviders(searchForwardModel);
	});

	function handleSearchForwardModelChange(event: Event) {
		searchForwardModel = (event.currentTarget as HTMLSelectElement).value;
		const nextModelId = searchForwardModel || undefined;
		if (clientSettings.modelId !== nextModelId) {
			clientSettings.modelId = nextModelId;
		}
	}

	function handleSearchForwardModeChange(event: Event) {
		searchForwardSearchMode = (event.currentTarget as HTMLSelectElement).value as
			| 'off'
			| 'standard'
			| 'deep';
		if (clientSettings.webSearchMode !== searchForwardSearchMode) {
			clientSettings.webSearchMode = searchForwardSearchMode;
		}
	}

	function handleSearchForwardProviderChange(event: Event) {
		searchForwardSearchProvider = (event.currentTarget as HTMLSelectElement).value as
			| 'linkup'
			| 'tavily'
			| 'exa'
			| 'kagi'
			| 'perplexity'
			| 'valyu'
			| 'brave'
			| 'brave-pro'
			| 'brave-research';
		if (clientSettings.webSearchProvider !== searchForwardSearchProvider) {
			clientSettings.webSearchProvider = searchForwardSearchProvider;
		}
	}

	function handleSearchForwardModelProviderChange(event: Event) {
		const nextProviderId = (event.currentTarget as HTMLSelectElement).value || undefined;
		if (clientSettings.providerId !== nextProviderId) {
			clientSettings.providerId = nextProviderId;
		}
	}

	function copySearchForwardUrl() {
		try {
			navigator.clipboard.writeText(searchForwardUrl);
			toast.success('Copied search URL');
		} catch {
			toast.error('Unable to copy URL');
		}
	}

	async function submitNewRule(e: SubmitEvent) {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const attach = formData.get('attach') as 'always' | 'manual';
		const rule = formData.get('rule') as string;

		if (rule === '' || !rule || ruleNameExists) return;

		creatingRule = true;

		await mutate(api.user_rules.create.url, {
			action: 'create',
			name,
			attach,
			rule,
		});

		newRuleCollapsible.open = false;
		name = '';

		creatingRule = false;
	}

	let name = $state('');

	const ruleNameExists = $derived(userRulesQuery.data?.findIndex((r) => r.name === name) !== -1);
</script>

<svelte:head>
	<title>Customization | nanochat</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-bold tracking-tight">Customization</h1>
	<p class="text-muted-foreground text-sm">Customize your experience with nanochat.</p>
</div>

<div class="mt-6 flex flex-col gap-8">
	<!-- Theme -->
	<section class="flex flex-col gap-3">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">Theme</h2>
			<p class="text-muted-foreground text-xs">Choose a color theme for the application.</p>
		</div>
		<div class="bg-card border-border rounded-lg border p-5">
			<ThemeSelector
				bind:currentTheme
				bind:primaryColor={currentThemePrimaryColor}
				bind:accentColor={currentThemeAccentColor}
			/>
		</div>
	</section>

	<!-- Search forwarding -->
	<section class="flex flex-col gap-3">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
				Search Forwarding URL
			</h2>
			<p class="text-muted-foreground text-xs">
				Use this URL to add nanochat as a search engine with your preferred model, provider, and web
				search defaults.
			</p>
		</div>
		<div class="bg-card border-border flex flex-col gap-4 rounded-lg border p-5">
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
				<div class="flex flex-col gap-2">
					<Label for="searchForwardModel">Model</Label>
					<select
						id="searchForwardModel"
						class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
						onchange={handleSearchForwardModelChange}
						value={searchForwardModel}
					>
						{#if availableModels.length === 0}
							<option value="" disabled>No models available</option>
						{:else}
							{#each availableModels as model (model.id)}
								<option value={model.id}>{model.id}</option>
							{/each}
						{/if}
					</select>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="searchForwardModelProvider">Model provider</Label>
					<select
						id="searchForwardModelProvider"
						class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
						onchange={handleSearchForwardModelProviderChange}
						value={clientSettings.providerId ?? ''}
						disabled={searchForwardProvidersLoading ||
							!searchForwardSupportsProviderSelection ||
							searchForwardModelProviders.length === 0}
					>
						<option value="">
							{searchForwardProvidersLoading
								? 'Loading providers...'
								: !searchForwardSupportsProviderSelection ||
									  searchForwardModelProviders.length === 0
									? 'Auto / unavailable'
									: 'Auto'}
						</option>
						{#each searchForwardModelProviders as provider (provider.provider)}
							<option value={provider.provider}>{provider.provider}</option>
						{/each}
					</select>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="searchForwardSearchMode">Search mode</Label>
					<select
						id="searchForwardSearchMode"
						class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
						onchange={handleSearchForwardModeChange}
						value={searchForwardSearchMode}
					>
						{#each searchModeOptions as mode}
							<option value={mode.value}>{mode.label}</option>
						{/each}
					</select>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="searchForwardSearchProvider">Search provider</Label>
					<select
						id="searchForwardSearchProvider"
						class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
						onchange={handleSearchForwardProviderChange}
						disabled={searchForwardSearchMode === 'off'}
						value={searchForwardSearchProvider}
					>
						{#each searchProviderOptions as provider}
							<option value={provider.value}>{provider.label}</option>
						{/each}
					</select>
				</div>
			</div>
			{#if searchForwardSearchMode !== 'off'}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
					<div class="flex flex-col gap-2">
						<Label for="searchForwardContextSize">Context size</Label>
						<select
							id="searchForwardContextSize"
							class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
							bind:value={clientSettings.webSearchContextSize}
						>
							{#each contextSizeOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					{#if searchForwardSearchProvider === 'exa'}
						<div class="flex flex-col gap-2">
							<Label for="searchForwardExaDepth">Exa depth</Label>
							<select
								id="searchForwardExaDepth"
								class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
								bind:value={clientSettings.webSearchExaDepth}
							>
								{#each exaDepthOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if searchForwardSearchProvider === 'kagi'}
						<div class="flex flex-col gap-2">
							<Label for="searchForwardKagiSource">Kagi source</Label>
							<select
								id="searchForwardKagiSource"
								class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
								bind:value={clientSettings.webSearchKagiSource}
							>
								{#each kagiSourceOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if searchForwardSearchProvider === 'valyu'}
						<div class="flex flex-col gap-2">
							<Label for="searchForwardValyuSearchType">Valyu search type</Label>
							<select
								id="searchForwardValyuSearchType"
								class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
								bind:value={clientSettings.webSearchValyuSearchType}
							>
								{#each valyuSearchTypeOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
			{/if}
			<div class="flex items-center gap-2">
				<Input value={searchForwardUrl} readonly />
				<Button type="button" onclick={copySearchForwardUrl}>
					<CopyIcon class="size-4" />
					Copy
				</Button>
			</div>
			<p class="text-muted-foreground text-xs">
				For browser search shortcuts, use <code class="bg-muted rounded px-1">%s</code> as the query placeholder.
			</p>
		</div>
	</section>

	<!-- Rules -->
	<section class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex flex-col gap-0.5">
				<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">Rules</h2>
				<p class="text-muted-foreground text-xs">
					Custom instructions the AI follows during conversations.
				</p>
			</div>
			<Button
				{...newRuleCollapsible.trigger}
				size="sm"
				variant={newRuleCollapsible.open ? 'outline' : 'default'}
			>
				{#if newRuleCollapsible.open}
					<XIcon class="size-4" />
				{:else}
					<PlusIcon class="size-4" />
				{/if}
				{newRuleCollapsible.open ? 'Cancel' : 'New Rule'}
			</Button>
		</div>

		{#if newRuleCollapsible.open}
			<div
				{...newRuleCollapsible.content}
				in:slide={{ duration: 150, axis: 'y' }}
				out:slide={{ duration: 150, axis: 'y' }}
				class="bg-card border-border flex flex-col gap-4 rounded-lg border p-5"
			>
				<div class="flex flex-col gap-1">
					<h3 class="font-medium">New Rule</h3>
					<p class="text-muted-foreground text-sm">
						Create a new rule to customize the behavior of your AI.
					</p>
				</div>
				<form onsubmit={submitNewRule} class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<Label for="name">Name (used when referencing the rule)</Label>
						<Input
							id="name"
							name="name"
							placeholder="My Rule"
							required
							bind:value={name}
							aria-invalid={ruleNameExists}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="attach">Rule Type</Label>
						<select
							id="attach"
							name="attach"
							class="border-input bg-background h-9 w-fit rounded-md border px-2 pr-6 text-sm"
							required
						>
							<option value="always">Always</option>
							<option value="manual">Manual</option>
						</select>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="rule">Instructions</Label>
						<Textarea id="rule" name="rule" placeholder="How should the AI respond?" required />
					</div>
					<div class="flex justify-end">
						<Button loading={creatingRule} type="submit">Create Rule</Button>
					</div>
				</form>
			</div>
		{/if}

		<div class="flex flex-col gap-3">
			{#each userRulesQuery.data ?? [] as rule (rule.id)}
				<Rule {rule} allRules={userRulesQuery.data ?? []} />
			{/each}
			{#if (userRulesQuery.data ?? []).length === 0 && !newRuleCollapsible.open}
				<div
					class="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm"
				>
					No rules yet. Create one to customize how the AI responds.
				</div>
			{/if}
		</div>
	</section>
</div>
