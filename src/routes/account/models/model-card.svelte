<script lang="ts">
	import type { Provider } from '$lib/types';
	import { Switch } from '$lib/components/ui/switch';
	import { mutate } from '$lib/client/mutation.svelte';
	import { api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte.js';
	import { ResultAsync } from 'neverthrow';
	import { getFirstSentence } from '$lib/utils/strings';
	import {
		supportsReasoning,
		supportsVideo,
		supportsVision,
		isImageOnlyModel,
	} from '$lib/utils/model-capabilities';
	import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import EyeIcon from '~icons/lucide/eye';
	import BrainIcon from '~icons/lucide/brain';
	import VideoIcon from '~icons/lucide/video';
	import TicketIcon from '~icons/lucide/ticket';
	import ImageIcon from '~icons/lucide/image';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import { cn } from '$lib/utils/utils';

	type Props = {
		enabled?: boolean;
		disabled?: boolean;
	} & {
		provider: typeof Provider.NanoGPT;
		model: NanoGPTModel;
	};

	let { provider, model, enabled = false, disabled = false }: Props = $props();

	const [shortDescription, fullDescription] = $derived(getFirstSentence(model.description));
	const hasMore = $derived(
		shortDescription !== null && fullDescription && shortDescription !== fullDescription
	);

	let expanded = $state(false);

	async function toggleEnabled(v: boolean) {
		enabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_enabled_models.set.url,
				{
					action: 'set',
					provider,
					modelId: model.id,
					enabled: v,
				},
				{
					invalidatePatterns: [
						api.user_enabled_models.get_enabled.url,
						api.user_enabled_models.is_enabled.url,
					],
				}
			),
			(e) => e
		);

		if (res.isErr()) enabled = !v;
	}

	const isNanoGPT = $derived(provider === 'nanogpt');
	const hasReasoning = $derived(isNanoGPT && supportsReasoning(model));
	const hasVision = $derived(isNanoGPT && supportsVision(model));
	const hasVideo = $derived(isNanoGPT && supportsVideo(model));
	const isImageOnly = $derived(isNanoGPT && isImageOnlyModel(model));
	const hasSubscription = $derived(isNanoGPT && Boolean(model.subscription?.included));
</script>

<div
	class={cn(
		'group hover:bg-accent/40 transition-colors',
		enabled ? 'bg-card' : 'bg-card/40'
	)}
>
	<div class="flex items-center gap-3 px-4 py-3">
		<!-- Capability icons -->
		<div class="flex shrink-0 items-center gap-1">
			{#if hasReasoning}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<div
							{...tooltip.trigger}
							class="flex size-6 items-center justify-center rounded-md bg-green-500/15 text-green-600 dark:text-green-400"
						>
							<BrainIcon class="size-3.5" />
						</div>
					{/snippet}
					Reasoning
				</Tooltip>
			{/if}
			{#if hasVision}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<div
							{...tooltip.trigger}
							class="flex size-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
						>
							<EyeIcon class="size-3.5" />
						</div>
					{/snippet}
					Vision (image input)
				</Tooltip>
			{/if}
			{#if hasVideo}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<div
							{...tooltip.trigger}
							class="flex size-6 items-center justify-center rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400"
						>
							<VideoIcon class="size-3.5" />
						</div>
					{/snippet}
					Video generation
				</Tooltip>
			{/if}
			{#if isImageOnly}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<div
							{...tooltip.trigger}
							class="flex size-6 items-center justify-center rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400"
						>
							<ImageIcon class="size-3.5" />
						</div>
					{/snippet}
					Image generation only
				</Tooltip>
			{/if}
		</div>

		<!-- Name + id -->
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="truncate font-medium">{model.name}</span>
				<span class="text-muted-foreground hidden truncate text-xs xl:inline">{model.id}</span>
			</div>
			{#if shortDescription}
				<p class="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
					{shortDescription}
				</p>
			{/if}
		</div>

		<!-- Subscription badge -->
		{#if hasSubscription}
			<Tooltip>
				{#snippet trigger(tooltip)}
					<div
						{...tooltip.trigger}
						class="hidden shrink-0 items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-700 sm:inline-flex dark:text-yellow-400"
					>
						<TicketIcon class="size-3" />
						<span>Subscription</span>
					</div>
				{/snippet}
				{model.subscription?.note || 'Included in subscription'}
			</Tooltip>
		{/if}

		<!-- Expand button -->
		{#if hasMore}
			<button
				type="button"
				onclick={() => (expanded = !expanded)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
				aria-label={expanded ? 'Collapse description' : 'Expand description'}
			>
				<ChevronDownIcon class={cn('size-4 transition-transform', expanded && 'rotate-180')} />
			</button>
		{/if}

		<!-- Toggle -->
		<Switch bind:value={() => enabled, toggleEnabled} {disabled} />
	</div>

	{#if expanded && hasMore}
		<div class="border-border/50 border-t px-4 py-3">
			<p class="text-muted-foreground text-sm leading-relaxed">{fullDescription}</p>
		</div>
	{/if}
</div>
