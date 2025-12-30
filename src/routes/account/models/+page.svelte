<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Search } from '$lib/components/ui/search';
	import { models } from '$lib/state/models.svelte';
	import { session } from '$lib/state/session.svelte';
	import { Provider } from '$lib/types.js';
	import { fuzzysearch } from '$lib/utils/fuzzy-search';
	import { cn } from '$lib/utils/utils';
	import { Toggle } from 'melt/builders';
	import PlusIcon from '~icons/lucide/plus';
	import XIcon from '~icons/lucide/x';
	import TicketIcon from '~icons/lucide/ticket';
	import ImageIcon from '~icons/lucide/image';
	import ModelCard from './model-card.svelte';
	import { supportsImages, supportsReasoning } from '$lib/utils/model-capabilities';

	const nanoGPTKeyQuery = useCachedQuery(api.user_keys.get, {
		provider: Provider.NanoGPT,
	});

	const hasNanoGPTKey = $derived(nanoGPTKeyQuery.data !== undefined && nanoGPTKeyQuery.data !== '');

	let search = $state('');

	const nanoGPTToggle = new Toggle({
		value: true,
		// TODO: enable this if and when when we use multiple providers
		disabled: true,
	});

	const subscriptionToggle = new Toggle({
		value: false,
	});

	const imageToggle = new Toggle({
		value: false,
	});

	let initiallyEnabled = $state<string[]>([]);
	$effect(() => {
		if (Object.keys(models.enabled).length && initiallyEnabled.length === 0) {
			initiallyEnabled = models
				.from(Provider.NanoGPT)
				.filter((m) => m.enabled)
				.map((m) => m.id);
		}
	});

	const nanoGPTModels = $derived(
		fuzzysearch({
			haystack: models.from(Provider.NanoGPT).filter((m) => {
				// Filter by subscription if toggle is enabled
				if (subscriptionToggle.value && !m.subscription?.included) {
					return false;
				}
				// Filter by image output capability if toggle is enabled
				if (imageToggle.value && !m.architecture?.output_modalities?.includes('image')) {
					return false;
				}
				return true;
			}),
			needle: search,
			property: 'name',
		}).sort((a, b) => {
			const aEnabled = initiallyEnabled.includes(a.id);
			const bEnabled = initiallyEnabled.includes(b.id);
			if (aEnabled && !bEnabled) return -1;
			if (!aEnabled && bEnabled) return 1;
			return 0;
		})
	);
</script>

<svelte:head>
	<title>Models | nanochat</title>
</svelte:head>

<h1 class="text-2xl font-bold">Available Models</h1>
<h2 class="text-muted-foreground mt-2 text-sm">
	Choose which models appear in your model selector. This won't affect existing conversations.
</h2>

<div class="mt-4 flex flex-col gap-2">
	<Search bind:value={search} placeholder="Search models" />
	<div class="flex place-items-center gap-2">
		<button
			{...nanoGPTToggle.trigger}
			aria-label="NanoGPT"
			class="group text-primary-foreground bg-primary aria-[pressed=false]:border-border border-primary aria-[pressed=false]:bg-background flex place-items-center gap-1 rounded-full border px-2 py-1 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-50"
		>
			NanoGPT
			<XIcon class="inline size-3 group-aria-[pressed=false]:hidden" />
			<PlusIcon class="inline size-3 group-aria-[pressed=true]:hidden" />
		</button>
		<button
			{...subscriptionToggle.trigger}
			aria-label="Subscription Only"
			class="group text-primary-foreground aria-[pressed=false]:border-border aria-[pressed=false]:bg-background aria-[pressed=false]:text-foreground flex place-items-center gap-1 rounded-full border border-yellow-500 bg-yellow-500 px-2 py-1 text-xs transition-all"
		>
			<TicketIcon class="inline size-3" />
			Subscription
			<XIcon class="inline size-3 group-aria-[pressed=false]:hidden" />
			<PlusIcon class="inline size-3 group-aria-[pressed=true]:hidden" />
		</button>
		<button
			{...imageToggle.trigger}
			aria-label="Image Models Only"
			class="group text-primary-foreground aria-[pressed=false]:border-border aria-[pressed=false]:bg-background aria-[pressed=false]:text-foreground flex place-items-center gap-1 rounded-full border border-violet-500 bg-violet-500 px-2 py-1 text-xs transition-all"
		>
			<ImageIcon class="inline size-3" />
			Image
			<XIcon class="inline size-3 group-aria-[pressed=false]:hidden" />
			<PlusIcon class="inline size-3 group-aria-[pressed=true]:hidden" />
		</button>
	</div>
</div>

{#if nanoGPTModels.length > 0}
	<div class="mt-4 flex flex-col gap-4">
		<div>
			<h3 class="text-lg font-bold">NanoGPT</h3>
			<p class="text-muted-foreground text-sm">Access to premium models via NanoGPT.</p>
			{#if !hasNanoGPTKey}
				<p class="text-muted-foreground mt-1 text-xs">
					<a href="/account/api-keys#nanogpt" class="text-primary underline">Add an API key</a> to get
					started.
				</p>
			{/if}
		</div>
		<div class="relative">
			<div class="flex flex-col gap-4 overflow-hidden">
				{#each nanoGPTModels as model (model.id)}
					<ModelCard provider={Provider.NanoGPT} {model} enabled={model.enabled} />
				{/each}
			</div>
		</div>
	</div>
{/if}
