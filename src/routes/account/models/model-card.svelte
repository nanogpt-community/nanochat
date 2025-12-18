<script lang="ts">
	import type { Provider } from '$lib/types';
	import * as Card from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';
	import { mutate } from '$lib/client/mutation.svelte';
	import { api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte.js';
	import { ResultAsync } from 'neverthrow';
	import { getFirstSentence } from '$lib/utils/strings';
	import { supportsImages, supportsReasoning } from '$lib/utils/model-capabilities';
	import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import EyeIcon from '~icons/lucide/eye';
	import BrainIcon from '~icons/lucide/brain';

	type Model = {
		id: string;
		name: string;
		description: string;
	};

	type Props = {
		enabled?: boolean;
		disabled?: boolean;
	} & {
		provider: typeof Provider.NanoGPT;
		model: NanoGPTModel;
	};

	let { provider, model, enabled = false, disabled = false }: Props = $props();

	const [shortDescription, fullDescription] = $derived(getFirstSentence(model.description));

	let showMore = $state(false);

	async function toggleEnabled(v: boolean) {
		enabled = v; // Optimistic!
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_enabled_models.set.url, {
				action: 'set',
				provider,
				modelId: model.id,
				enabled: v,
			}, {
				invalidatePatterns: [api.user_enabled_models.get_enabled.url, api.user_enabled_models.is_enabled.url]
			}),
			(e) => e
		);

		if (res.isErr()) enabled = !v; // Should have been a realist :(
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center justify-between">
			<div class="flex place-items-center gap-2">
				<Card.Title>{model.name}</Card.Title>
				<span class="text-muted-foreground hidden text-xs xl:block">{model.id}</span>
			</div>
			<Switch bind:value={() => enabled, toggleEnabled} {disabled} />
		</div>
		<Card.Description>
			{showMore ? fullDescription : (shortDescription ?? fullDescription)}
		</Card.Description>
		{#if shortDescription !== null}
			<button
				type="button"
				class="text-muted-foreground w-fit text-start text-xs"
				onclick={() => (showMore = !showMore)}
				{disabled}
			>
				{showMore ? 'Show less' : 'Show more'}
			</button>
		{/if}
	</Card.Header>
	<Card.Content>
		<div class="flex place-items-center gap-1">


			{#if model && provider === 'nanogpt' && supportsReasoning(model)}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<div
							{...tooltip.trigger}
							class="rounded-md border-green-500 bg-green-500/50 p-1 text-green-400"
						>
							<BrainIcon class="size-3" />
						</div>
					{/snippet}
					Supports reasoning
				</Tooltip>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
