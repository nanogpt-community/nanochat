<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Search } from '$lib/components/ui/search';
	import { mutate } from '$lib/client/mutation.svelte';
	import { models } from '$lib/state/models.svelte';
	import { session } from '$lib/state/session.svelte';
	import { Provider } from '$lib/types.js';
	import { fuzzysearch } from '$lib/utils/fuzzy-search';
	import { cn } from '$lib/utils/utils';
	import { Toggle } from 'melt/builders';
	import { ResultAsync } from 'neverthrow';
	import CheckIcon from '~icons/lucide/check';
	import TicketIcon from '~icons/lucide/ticket';
	import ImageIcon from '~icons/lucide/image';
	import VideoIcon from '~icons/lucide/video';
	import type { UserKeyStatus } from '$lib/api';
	import ModelCard from './model-card.svelte';
	import { supportsVideo } from '$lib/utils/model-capabilities';

	const nanoGPTKeyQuery = useCachedQuery<UserKeyStatus>(api.user_keys.get, {
		provider: Provider.NanoGPT,
	});

	const hasNanoGPTKey = $derived(nanoGPTKeyQuery.data?.hasKey ?? false);

	let search = $state('');

	const subscriptionToggle = new Toggle({
		value: false,
	});

	const imageToggle = new Toggle({
		value: false,
	});

	const videoToggle = new Toggle({
		value: false,
	});

	const nanoGPTModelCollection = $derived(models.from(Provider.NanoGPT));
	let bulkToggleState = $state<'enable' | 'disable' | 'reset' | null>(null);

	const allNanoGPTModelsEnabled = $derived(nanoGPTModelCollection.every((model) => model.enabled));
	const someNanoGPTModelsEnabled = $derived(
		nanoGPTModelCollection.some((model) => model.enabled)
	);
	const enabledCount = $derived(nanoGPTModelCollection.filter((m) => m.enabled).length);
	const totalCount = $derived(nanoGPTModelCollection.length);
	const activeFilterCount = $derived(
		(subscriptionToggle.value ? 1 : 0) + (imageToggle.value ? 1 : 0) + (videoToggle.value ? 1 : 0)
	);

	async function setAllNanoGPTModels(enabled: boolean) {
		if (!session.current?.user.id) return;
		if (nanoGPTModelCollection.length === 0) return;

		bulkToggleState = enabled ? 'enable' : 'disable';

		await ResultAsync.fromPromise(
			mutate(
				api.user_enabled_models.set.url,
				{
					action: 'setAll',
					provider: Provider.NanoGPT,
					enabled,
				},
				{
					invalidatePatterns: [api.user_enabled_models.get_enabled.url],
				}
			),
			(error) => {
				console.error(`Failed to ${enabled ? 'enable' : 'disable'} all NanoGPT models`, error);
				return error;
			}
		);

		bulkToggleState = null;
	}

	async function resetNanoGPTModels() {
		if (!session.current?.user.id) return;

		bulkToggleState = 'reset';

		await ResultAsync.fromPromise(
			mutate(
				api.user_enabled_models.set.url,
				{
					action: 'resetDefaults',
				},
				{
					invalidatePatterns: [api.user_enabled_models.get_enabled.url],
				}
			),
			(error) => {
				console.error('Failed to reset NanoGPT models to defaults', error);
				return error;
			}
		);

		bulkToggleState = null;
	}

	const nanoGPTModels = $derived(
		fuzzysearch({
			haystack: nanoGPTModelCollection.filter((m) => {
				// Filter by subscription if toggle is enabled
				if (subscriptionToggle.value && !m.subscription?.included) {
					return false;
				}
				// Filter by image output capability if toggle is enabled
				if (imageToggle.value && !m.architecture?.output_modalities?.includes('image')) {
					return false;
				}
				// Filter by video output capability if toggle is enabled
				if (videoToggle.value && !supportsVideo(m)) {
					return false;
				}
				return true;
			}),
			needle: search,
			property: 'name',
		}).sort((a, b) => {
			const aEnabled = a.enabled;
			const bEnabled = b.enabled;
			if (aEnabled && !bEnabled) return -1;
			if (!aEnabled && bEnabled) return 1;
			return 0;
		})
	);
</script>

<svelte:head>
	<title>Models | nanochat</title>
</svelte:head>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold tracking-tight">Available Models</h1>
		<p class="text-muted-foreground text-sm">
			Choose which models appear in your model selector. This won't affect existing conversations.
		</p>
	</div>
	<div class="flex items-center gap-2">
		<span
			class="border-border bg-card text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums"
		>
			<span class="text-foreground font-semibold">{enabledCount}</span>
			<span>of</span>
			<span>{totalCount}</span>
			<span>enabled</span>
		</span>
	</div>
</div>

<!-- Search + Filters -->
<div class="mt-6 flex flex-col gap-3">
	<Search bind:value={search} placeholder="Search models by name…" />

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-muted-foreground mr-1 text-xs font-medium">Filters:</span>

		<button
			{...subscriptionToggle.trigger}
			aria-label="Subscription Only"
			class={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
				subscriptionToggle.value
					? 'border-yellow-500/60 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300'
					: 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
			)}
		>
			{#if subscriptionToggle.value}
				<CheckIcon class="size-3" />
			{:else}
				<TicketIcon class="size-3" />
			{/if}
			Subscription
		</button>

		<button
			{...imageToggle.trigger}
			aria-label="Image Models Only"
			class={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
				imageToggle.value
					? 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-300'
					: 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
			)}
		>
			{#if imageToggle.value}
				<CheckIcon class="size-3" />
			{:else}
				<ImageIcon class="size-3" />
			{/if}
			Image
		</button>

		<button
			{...videoToggle.trigger}
			aria-label="Video Models Only"
			class={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
				videoToggle.value
					? 'border-blue-500/60 bg-blue-500/15 text-blue-700 dark:text-blue-300'
					: 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
			)}
		>
			{#if videoToggle.value}
				<CheckIcon class="size-3" />
			{:else}
				<VideoIcon class="size-3" />
			{/if}
			Video
		</button>

		{#if activeFilterCount > 0}
			<button
				type="button"
				onclick={() => {
					subscriptionToggle.value = false;
					imageToggle.value = false;
					videoToggle.value = false;
				}}
				class="text-muted-foreground hover:text-foreground ml-1 text-xs underline-offset-4 hover:underline"
			>
				Clear filters
			</button>
		{/if}
	</div>

	<!-- Bulk actions -->
	<div class="border-border flex flex-wrap items-center gap-2 border-t pt-3">
		<Button
			variant="outline"
			size="sm"
			onclick={() => setAllNanoGPTModels(true)}
			loading={bulkToggleState === 'enable'}
			disabled={bulkToggleState !== null || allNanoGPTModelsEnabled}
		>
			Enable all
		</Button>
		<Button
			variant="outline"
			size="sm"
			onclick={() => setAllNanoGPTModels(false)}
			loading={bulkToggleState === 'disable'}
			disabled={bulkToggleState !== null || !someNanoGPTModelsEnabled}
		>
			Disable all
		</Button>
		<Button
			variant="ghost"
			size="sm"
			onclick={resetNanoGPTModels}
			loading={bulkToggleState === 'reset'}
			disabled={bulkToggleState !== null || nanoGPTModelCollection.length === 0}
		>
			Reset defaults
		</Button>
	</div>
</div>

<!-- Model list -->
<div class="mt-6">
	{#if nanoGPTModels.length === 0}
		<div
			class="border-border text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center"
		>
			<p class="text-sm font-medium">No models match your filters.</p>
			{#if search || activeFilterCount > 0}
				<button
					type="button"
					class="text-primary text-xs hover:underline"
					onclick={() => {
						search = '';
						subscriptionToggle.value = false;
						imageToggle.value = false;
						videoToggle.value = false;
					}}
				>
					Reset search and filters
				</button>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<div class="flex items-baseline justify-between">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
						NanoGPT
					</h3>
					<p class="text-muted-foreground text-xs">
						{nanoGPTModels.length} model{nanoGPTModels.length === 1 ? '' : 's'} · Access to premium
						models via NanoGPT.
						{#if !hasNanoGPTKey}
							<a href="/account/api-keys#nanogpt" class="text-primary ml-1 underline">
								Add an API key
							</a> to get started.
						{/if}
					</p>
				</div>
			</div>

			<div class="bg-card border-border divide-border divide-y overflow-hidden rounded-lg border">
				{#each nanoGPTModels as model (model.id)}
					<ModelCard provider={Provider.NanoGPT} {model} enabled={model.enabled} />
				{/each}
			</div>
		</div>
	{/if}
</div>
