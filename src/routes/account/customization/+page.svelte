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
	import {
		Root as Card,
		Content as CardContent,
		Description as CardDescription,
		Header as CardHeader,
		Title as CardTitle,
	} from '$lib/components/ui/card';

	const newRuleCollapsible = new Collapsible({
		open: false,
	});

	let creatingRule = $state(false);

	const userRulesQuery: QueryResult<Doc<'user_rules'>[]> = useCachedQuery(api.user_rules.all, {});
	const userSettings = useCachedQuery<UserSettings>(api.user_settings.get, {});
	const availableModels = $derived(models.from(Provider.NanoGPT));

	let currentTheme = $state(userSettings.data?.theme ?? null);
	let currentThemePrimaryColor = $state(userSettings.data?.themePrimaryColor ?? null);
	let currentThemeAccentColor = $state(userSettings.data?.themeAccentColor ?? null);
	const searchModeOptions = $state(['off', 'standard', 'deep'] as const);
	const searchProviderOptions = $state([
		'linkup',
		'tavily',
		'exa',
		'kagi',
		'perplexity',
		'valyu',
		'brave',
		'brave-pro',
		'brave-research',
	] as const);

	let searchForwardModel = $state(clientSettings.modelId ?? '');
	let searchForwardSearchMode = $state(clientSettings.webSearchMode);
	let searchForwardSearchProvider = $state(clientSettings.webSearchProvider);

	const searchForwardUrl = $derived.by(() => {
		const params: string[] = [];
		if (searchForwardModel) {
			params.push(`model=${encodeURIComponent(searchForwardModel)}`);
		}
		params.push(`search=${encodeURIComponent(searchForwardSearchMode)}`);
		if (searchForwardSearchMode !== 'off') {
			params.push(`search_provider=${encodeURIComponent(searchForwardSearchProvider)}`);
		}
		params.push('q=%s');
		return `${page.url.origin}/chat?${params.join('&')}`;
	});

	$effect(() => {
		if (userSettings.data?.theme !== undefined) {
			currentTheme = userSettings.data.theme;
			currentThemePrimaryColor = userSettings.data.themePrimaryColor ?? null;
			currentThemeAccentColor = userSettings.data.themeAccentColor ?? null;
		}
		if (searchForwardModel && !availableModels.some((model) => model.id === searchForwardModel)) {
			searchForwardModel = availableModels[0]?.id ?? '';
		}
		if (!searchForwardModel && availableModels.length > 0) {
			searchForwardModel = availableModels[0]!.id;
		}
		if (searchForwardModel) {
			clientSettings.modelId = searchForwardModel;
		}
		searchForwardSearchMode = clientSettings.webSearchMode;
		searchForwardSearchProvider = clientSettings.webSearchProvider;
	});

	function handleSearchForwardModelChange(event: Event) {
		searchForwardModel = (event.currentTarget as HTMLSelectElement).value;
		clientSettings.modelId = searchForwardModel || undefined;
	}

	function handleSearchForwardModeChange(event: Event) {
		searchForwardSearchMode = (event.currentTarget as HTMLSelectElement).value as
			| 'off'
			| 'standard'
			| 'deep';
		clientSettings.webSearchMode = searchForwardSearchMode;
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
		clientSettings.webSearchProvider = searchForwardSearchProvider;
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

<h1 class="text-2xl font-bold">Customization</h1>
<h2 class="text-muted-foreground mt-2 text-sm">Customize your experience with nanochat.</h2>

<div class="mt-8 flex flex-col gap-4">
	<Card>
		<CardHeader>
			<CardTitle>Search forwarding URL</CardTitle>
			<CardDescription>Use this URL to add nanochat as a search engine.</CardDescription>
		</CardHeader>
		<CardContent class="gap-3">
			<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
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
					<Label for="searchForwardSearchMode">Search mode</Label>
					<select
						id="searchForwardSearchMode"
						class="border-input bg-background h-9 w-full rounded-md border px-2 pr-6 text-sm"
						onchange={handleSearchForwardModeChange}
						value={searchForwardSearchMode}
					>
						{#each searchModeOptions as mode}
							<option value={mode}>{mode}</option>
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
							<option value={provider}>{provider}</option>
						{/each}
					</select>
				</div>
			</div>
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
		</CardContent>
	</Card>
	<!-- Theme Section -->
	<Card>
		<CardHeader>
			<CardTitle>Theme</CardTitle>
			<CardDescription>Choose a color theme for the application.</CardDescription>
		</CardHeader>
		<CardContent>
			<ThemeSelector
				bind:currentTheme
				bind:primaryColor={currentThemePrimaryColor}
				bind:accentColor={currentThemeAccentColor}
			/>
		</CardContent>
	</Card>
	<div class="flex place-items-center justify-between">
		<h3 class="text-xl font-bold">Rules</h3>
		<Button
			{...newRuleCollapsible.trigger}
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
			class="bg-card flex flex-col gap-4 rounded-lg border p-4"
		>
			<div class="flex flex-col gap-1">
				<h3 class="text-lg font-bold">New Rule</h3>
				<p class="text-muted-foreground text-sm">
					Create a new rule to customize the behavior of your AI.
				</p>
			</div>
			<form onsubmit={submitNewRule} class="flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<Label for="name">Name (Used when referencing the rule)</Label>
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
	{#each userRulesQuery.data ?? [] as rule (rule.id)}
		<Rule {rule} allRules={userRulesQuery.data ?? []} />
	{/each}
</div>
