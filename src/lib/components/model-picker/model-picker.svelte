<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { models as modelsState } from '$lib/state/models.svelte';
	import { session } from '$lib/state/session.svelte';
	import { settings } from '$lib/state/settings.svelte';
	import { Provider } from '$lib/types';
	import { fuzzysearch } from '$lib/utils/fuzzy-search';
	import { supportsImages, supportsReasoning } from '$lib/utils/model-capabilities';
	import { capitalize } from '$lib/utils/strings';
	import { cn } from '$lib/utils/utils';
	import BrainIcon from '~icons/lucide/brain';
	import SearchIcon from '~icons/lucide/search';
	import EyeIcon from '~icons/lucide/eye';
	import { Command } from 'bits-ui';
	import * as Popover from '$lib/components/ui/popover';
	import { shortcut } from '$lib/actions/shortcut.svelte';
	import { Button } from '../ui/button';
	import { Kbd } from '../ui/kbd';
	import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { ResultAsync } from 'neverthrow';
	import PinIcon from '~icons/lucide/pin';
	import { isFirefox } from '$lib/hooks/is-firefox.svelte';

	// Helper to check if model is pinned
	function isPinned(model: { pinned?: boolean }): boolean {
		return model.pinned === true;
	}

	type Props = {
		class?: string;
		/* When images are attached, we should not select models that don't support images */
		onlyImageModels?: boolean;
	};

	let { class: className, onlyImageModels }: Props = $props();

	const enabledModelsQuery = useCachedQuery(api.user_enabled_models.get_enabled, {});

	const enabledArr = $derived(Object.values(enabledModelsQuery.data ?? {}));

	modelsState.init();

	let search = $state('');

	const filteredModels = $derived(
		fuzzysearch({
			haystack: enabledArr,
			needle: search,
			property: 'modelId',
		})
	);

	const currentModel = $derived(enabledArr.find((m) => m.modelId === settings.modelId));

	$effect(() => {
		if (!enabledArr.find((m) => m.modelId === settings.modelId) && enabledArr.length > 0) {
			settings.modelId = enabledArr[0]!.modelId;
		}
	});

	let open = $state(false);

	let activeModel = $state('');

	// Model name formatting utility
	const termReplacements = [
		{ from: 'gpt', to: 'GPT' },
		{ from: 'claude', to: 'Claude' },
		{ from: 'deepseek', to: 'DeepSeek' },
		{ from: 'o3', to: 'o3' },
	];

	function formatModelName(modelId: string | undefined) {
		if (!modelId) return { full: 'Unknown Model', primary: 'Unknown', secondary: '' };
		const cleanId = modelId.replace(/^[^/]+\//, '');
		const parts = cleanId.split(/[-_,:]/);

		const formattedParts = parts.map((part) => {
			let formatted = capitalize(part);
			termReplacements.forEach(({ from, to }) => {
				formatted = formatted.replace(new RegExp(`\\b${from}\\b`, 'gi'), to);
			});
			return formatted;
		});

		return {
			full: formattedParts.join(' '),
			primary: formattedParts[0] || '',
			secondary: formattedParts.slice(1).join(' '),
		};
	}

	function modelSelected(modelId: string) {
		settings.modelId = modelId;
		open = false;
	}

	let pinning = $state(false);

	async function togglePin(modelId: string) {
		pinning = true;

		await ResultAsync.fromPromise(
			mutate(api.user_enabled_models.toggle_pinned.url, {
				action: 'togglePinned',
				modelId,
			}),
			(e) => e
		);

		pinning = false;
	}

	const isMobile = new IsMobile();

	const activeModelInfo = $derived.by(() => {
		if (activeModel === '') return null;

		const model = enabledArr.find((m) => m.modelId === activeModel);

		if (!model) return null;

		return {
			...model,
			formatted: formatModelName(activeModel),
		};
	});

	const pinnedModels = $derived(enabledArr.filter((m) => isPinned(m)));
</script>

<svelte:window
	use:shortcut={{
		ctrl: true,
		shift: true,
		key: 'm',
		callback: () => (open = true),
	}}
/>

<Popover.Root bind:open>
	<Popover.Trigger
		class={cn(
			'ring-offset-background focus:ring-ring flex items-center justify-between rounded-lg px-2 py-1 text-xs transition hover:text-white focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
	>
		<div class="flex items-center gap-2 pr-2">
			<span class="truncate">
				{#if enabledArr.length === 0}
					Loading...
				{:else if currentModel}
					{formatModelName(currentModel.modelId).full}
				{:else}
					Select model
				{/if}
			</span>
		</div>
	</Popover.Trigger>

	<Popover.Content
		portalProps={{
			disabled: isFirefox,
		}}
		side="bottom"
		align="start"
		sideOffset={4}
		collisionPadding={20}
		hideWhenDetached={true}
		onOpenAutoFocus={(e) => e.preventDefault()}
		class={cn(
			'p-0 w-[400px]',
			'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
			{
				'max-w-[calc(100vw-2rem)]': isMobile.current,
			}
		)}
	>
		{#if enabledArr.length === 0}
			<div class="flex items-center justify-center p-8 text-muted-foreground">
				<p>Loading models...</p>
			</div>
		{:else}
			<Command.Root
				class={cn('flex h-full w-full flex-col overflow-hidden')}
				bind:value={activeModel}
			>
				<label class="border-border relative flex items-center gap-2 border-b px-4 py-3 text-sm">
					<SearchIcon class="text-muted-foreground" />
					<Command.Input
						class="w-full outline-none"
						placeholder="Search models..."
						onkeydown={(e) => {
							if (e.ctrlKey || e.metaKey) {
									if (e.key === 'u') {
									if (activeModelInfo) {
										e.preventDefault();
										e.stopPropagation();
										togglePin(activeModelInfo.id);
									}
								}
							}
						}}
					/>
				</label>
				<Command.List
					class="overflow-y-auto p-1 flex flex-col gap-1"
					style="max-height: 480px;"
				>
					{#each filteredModels as model (model.id)}
						{@const formatted = formatModelName(model.modelId)}
						{@const nanoGPTModel = modelsState
							.from(Provider.NanoGPT)
							.find((m) => m.id === model.modelId)}
						{@const disabled = false}

						<Command.Item
							value={model.modelId}
							class={cn(
								'bg-popover flex rounded-lg p-2',
								'relative scroll-m-36 select-none',
								'data-selected:bg-accent/50 data-selected:text-accent-foreground',
								'h-10 items-center justify-between',
								disabled && 'opacity-50'
							)}
							onSelect={() => modelSelected(model.modelId)}
						>
							<div class="flex items-center gap-2">
								<p class="font-fake-proxima text-sm leading-tight font-bold">
									{formatted.full}
								</p>
							</div>

							<div class="flex place-items-center gap-1">


								{#if nanoGPTModel && supportsReasoning(nanoGPTModel)}
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

								{#if isPinned(model)}
									<PinIcon class="size-3 opacity-50" />
								{/if}
							</div>
						</Command.Item>
					{/each}
				</Command.List>
			</Command.Root>
			<div class="border-border flex place-items-center justify-between border-t p-2">
				{#if !isMobile.current && activeModelInfo}
					<div>
						<Button
							variant="ghost"
							loading={pinning}
							class="bg-popover"
							size="sm"
							onclick={() => togglePin(activeModelInfo.id)}
						>
							<span class="text-muted-foreground">
								{isPinned(activeModelInfo) ? 'Unpin' : 'Pin'}
							</span>
							<span>
								<Kbd size="xs">{cmdOrCtrl}</Kbd>
								<Kbd size="xs">U</Kbd>
							</span>
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>


