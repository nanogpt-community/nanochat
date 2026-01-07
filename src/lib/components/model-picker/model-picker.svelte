<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { models as modelsState } from '$lib/state/models.svelte';
	import { session } from '$lib/state/session.svelte';
	import { settings } from '$lib/state/settings.svelte';
	import { Provider } from '$lib/types';
	import { fuzzysearch } from '$lib/utils/fuzzy-search';
	import {
		supportsImages,
		supportsReasoning,
		supportsVideo,
		isImageOnlyModel,
		supportsVision,
	} from '$lib/utils/model-capabilities';
	import { capitalize } from '$lib/utils/strings';
	import { cn } from '$lib/utils/utils';
	import BrainIcon from '~icons/lucide/brain';
	import SearchIcon from '~icons/lucide/search';
	import EyeIcon from '~icons/lucide/eye';
	import VideoIcon from '~icons/lucide/video';
	import StarIcon from '~icons/lucide/star';
	import InfoIcon from '~icons/lucide/info';
	import FilterIcon from '~icons/lucide/filter';
	import ImageIcon from '~icons/lucide/image';
	import { Command } from 'bits-ui';
	import * as Popover from '$lib/components/ui/popover';
	import { shortcut, getKeybindOptions } from '$lib/actions/shortcut.svelte';
	import { Button } from '../ui/button';
	import { Kbd } from '../ui/kbd';
	import { cmdOrCtrl, formatKeybind } from '$lib/hooks/is-mac.svelte';
	import { keybinds, DEFAULT_KEYBINDS } from '$lib/state/keybinds.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { ResultAsync } from 'neverthrow';
	import PinIcon from '~icons/lucide/pin';
	import { isFirefox } from '$lib/hooks/is-firefox.svelte';
	import ModelInfoPanel from './model-info-panel.svelte';
	import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
	import { fade, fly } from 'svelte/transition';

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
	let selectedProvider = $state<string | null>(null);
	let infoModel = $state<NanoGPTModel | null>(null);

	// Get unique providers from enabled models using icon_url or fallback
	const uniqueProviders = $derived.by(() => {
		const providers = new Map<string, { iconUrl: string; count: number }>();

		for (const model of enabledArr) {
			const nanoModel = modelsState.from(Provider.NanoGPT).find((m) => m.id === model.modelId);
			// Use icon_url from API, or check for fallback icon
			let iconUrl = nanoModel?.icon_url;
			if (!iconUrl) {
				// Check for fallback icon based on model ID
				const lowerModelId = model.modelId.toLowerCase();
				if (lowerModelId.includes('grok') || lowerModelId.includes('x-ai')) {
					iconUrl = 'fallback:grok';
				}
			}
			if (iconUrl) {
				const existing = providers.get(iconUrl);
				providers.set(iconUrl, {
					iconUrl: iconUrl,
					count: (existing?.count ?? 0) + 1,
				});
			}
		}

		return Array.from(providers.values());
	});

	const filteredModels = $derived(
		fuzzysearch({
			haystack: enabledArr,
			needle: search,
			property: 'modelId',
		})
			.filter((model) => {
				// When searching, show all providers
				if (search) return true;
				if (!selectedProvider) return true;
				const nanoModel = modelsState.from(Provider.NanoGPT).find((m) => m.id === model.modelId);
				// Check icon_url first, then check for fallback match
				if (nanoModel?.icon_url === selectedProvider) return true;
				// Check for fallback provider match
				if (selectedProvider === 'fallback:grok') {
					const lowerModelId = model.modelId.toLowerCase();
					if (lowerModelId.includes('grok') || lowerModelId.includes('x-ai')) return true;
				}
				return false;
			})
			.sort((a, b) => {
				const aPinned = isPinned(a);
				const bPinned = isPinned(b);
				if (aPinned && !bPinned) return -1;
				if (!aPinned && bPinned) return 1;
				return 0;
			})
	);

	const currentModel = $derived(enabledArr.find((m) => m.modelId === settings.modelId));

	$effect(() => {
		if (enabledModelsQuery.isLoading) return;
		if (!enabledArr.find((m) => m.modelId === settings.modelId) && enabledArr.length > 0) {
			settings.modelId = enabledArr[0]!.modelId;
		}
	});

	let open = $state(false);

	// Touch gesture handling for mobile drawer
	let touchStartY = $state(0);
	let isDragging = $state(false);
	let drawerTranslateY = $state(0);

	let activeModel = $state('');

	// Auto-select first model when picker opens
	$effect(() => {
		if (open && filteredModels.length > 0 && !activeModel) {
			activeModel = filteredModels[0]?.modelId ?? '';
		}
	});

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

	async function togglePin(modelId: string, e?: MouseEvent) {
		e?.stopPropagation();
		e?.preventDefault();
		pinning = true;

		await ResultAsync.fromPromise(
			mutate(
				api.user_enabled_models.toggle_pinned.url,
				{
					action: 'togglePinned',
					modelId,
				},
				{
					invalidatePatterns: [api.user_enabled_models.get_enabled.url],
				}
			),
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

	// Fallback icons for providers that don't have icon_url in the API
	const FALLBACK_ICONS: Record<string, string> = {
		grok: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Grok-icon.svg/640px-Grok-icon.svg.png',
		'x-ai':
			'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Grok-icon.svg/640px-Grok-icon.svg.png',
	};

	function getIconUrl(iconPath: string | undefined, modelId?: string): string {
		if (iconPath) {
			// Handle fallback: protocol for sidebar icons
			if (iconPath.startsWith('fallback:')) {
				const fallbackKey = iconPath.replace('fallback:', '');
				return FALLBACK_ICONS[fallbackKey] ?? '';
			}
			// Icons are served from nano-gpt.com
			if (iconPath.startsWith('/')) {
				return `https://nano-gpt.com${iconPath}`;
			}
			return iconPath;
		}

		// Check for fallback based on model ID
		if (modelId) {
			const lowerModelId = modelId.toLowerCase();
			for (const [key, url] of Object.entries(FALLBACK_ICONS)) {
				if (lowerModelId.includes(key)) {
					return url;
				}
			}
		}

		return '';
	}
</script>

<svelte:window use:shortcut={getKeybindOptions('openModelPicker', () => (open = true))} />

{#snippet pickerContent()}
	<div class={cn('flex h-full min-h-0 w-full overflow-hidden', isMobile.current && 'flex-col')}>
		<!-- Provider Bar - Horizontal on mobile, Vertical sidebar on desktop -->
		<div
			class={cn(
				'border-border bg-muted/30 flex gap-1 p-2',
				isMobile.current ? 'flex-row overflow-x-auto border-b' : 'flex-col border-r'
			)}
		>
			<!-- Favorites/All button -->
			<button
				class={cn(
					'hover:bg-accent flex flex-shrink-0 items-center justify-center rounded-lg transition-colors',
					isMobile.current ? 'p-3' : 'p-2',
					selectedProvider === null && 'bg-accent text-accent-foreground'
				)}
				onclick={() => {
					search = '';
					selectedProvider = null;
				}}
			>
				<StarIcon class={cn(isMobile.current ? 'size-6' : 'size-5')} />
			</button>

			<!-- Provider icons -->
			{#each uniqueProviders as provider (provider.iconUrl)}
				<button
					class={cn(
						'hover:bg-accent flex flex-shrink-0 items-center justify-center rounded-lg transition-colors',
						isMobile.current ? 'p-3' : 'p-2',
						selectedProvider === provider.iconUrl && 'bg-accent text-accent-foreground'
					)}
					onclick={() => {
						search = '';
						selectedProvider = provider.iconUrl;
					}}
				>
					<img
						src={getIconUrl(provider.iconUrl)}
						alt="Provider"
						class={cn(isMobile.current ? 'size-6' : 'size-5', 'object-contain')}
					/>
				</button>
			{/each}
		</div>

		<!-- Main content -->
		<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<Command.Root
				class={cn('flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden')}
				bind:value={activeModel}
				shouldFilter={false}
			>
				<label
					class={cn(
						'border-border relative flex items-center gap-2 border-b text-sm',
						isMobile.current ? 'px-3 py-3' : 'px-4 py-3'
					)}
				>
					<SearchIcon class={cn('text-muted-foreground', isMobile.current ? 'size-5' : 'size-4')} />
					<Command.Input
						class="placeholder:text-muted-foreground w-full bg-transparent outline-none"
						placeholder="Search models..."
						bind:value={search}
						onkeydown={(e) => {
							// Arrow key navigation
							if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
								e.preventDefault();
								const currentIndex = filteredModels.findIndex((m) => m.modelId === activeModel);
								let newIndex: number;

								if (e.key === 'ArrowDown') {
									newIndex = currentIndex < filteredModels.length - 1 ? currentIndex + 1 : 0;
								} else {
									newIndex = currentIndex > 0 ? currentIndex - 1 : filteredModels.length - 1;
								}

								const newModel = filteredModels[newIndex];
								if (newModel) {
									activeModel = newModel.modelId;
								}
								return;
							}

							// Enter to select
							if (e.key === 'Enter' && activeModel) {
								e.preventDefault();
								modelSelected(activeModel);
								return;
							}

							// Get pin config with fallback to defaults
							const pinConfig = keybinds.pinModel ?? DEFAULT_KEYBINDS.pinModel;

							// Check modifiers - compare as booleans
							const hasCtrlOrMeta = e.ctrlKey || e.metaKey;
							const ctrlRequired = pinConfig.ctrl === true;
							const shiftRequired = pinConfig.shift === true;
							const altRequired = pinConfig.alt === true;

							const ctrlMatch = ctrlRequired === hasCtrlOrMeta;
							const shiftMatch = shiftRequired === e.shiftKey;
							const altMatch = altRequired === e.altKey;
							const keyMatch = e.key.toLowerCase() === String(pinConfig.key).toLowerCase();

							if (ctrlMatch && shiftMatch && altMatch && keyMatch && activeModelInfo) {
								e.preventDefault();
								e.stopPropagation();
								togglePin(activeModelInfo.id);
							}
						}}
					/>
					{#if !isMobile.current}
						<FilterIcon class="text-muted-foreground size-4 opacity-50" />
					{/if}
				</label>
				<div class={cn('min-h-0 flex-1 overflow-y-auto', isMobile.current ? 'p-2' : 'p-1')}>
					<Command.List class="flex flex-col gap-0.5">
						{#each filteredModels as model (model.id)}
							{@const formatted = formatModelName(model.modelId)}
							{@const nanoGPTModel = modelsState
								.from(Provider.NanoGPT)
								.find((m) => m.id === model.modelId)}
							{@const modelIconUrl = getIconUrl(nanoGPTModel?.icon_url, model.modelId)}
							{@const disabled = false}

							<Command.Item
								value={model.modelId}
								class={cn(
									'flex gap-3 overflow-hidden rounded-lg',
									isMobile.current ? 'p-3' : 'p-2',
									'relative cursor-pointer scroll-m-36 select-none',
									'hover:bg-accent/50 active:bg-accent/70',
									'data-selected:bg-accent/50 data-selected:text-accent-foreground',
									disabled && 'opacity-50',
									activeModel === model.modelId && 'bg-accent/50 text-accent-foreground'
								)}
								onSelect={() => modelSelected(model.modelId)}
								onmouseenter={() => !isMobile.current && (activeModel = model.modelId)}
							>
								<!-- Provider Icon -->
								<div class="flex flex-shrink-0 items-start pt-0.5">
									{#if modelIconUrl}
										<img
											src={modelIconUrl}
											alt=""
											class={cn(isMobile.current ? 'size-6' : 'size-5', 'object-contain')}
										/>
									{:else}
										<div
											class={cn(
												'bg-muted text-muted-foreground flex items-center justify-center rounded text-xs',
												isMobile.current ? 'size-6' : 'size-5'
											)}
										>
											?
										</div>
									{/if}
								</div>

								<!-- Model Info -->
								<div class="min-w-0 flex-1 overflow-hidden">
									<div class="flex items-center gap-2">
										<span
											class={cn(
												'truncate font-semibold',
												isMobile.current ? 'text-base' : 'text-sm'
											)}
										>
											{formatted.full}
										</span>

										<!-- Favorite star toggle -->
										<button
											class={cn(
												'flex-shrink-0 rounded p-0.5 transition-colors',
												isPinned(model)
													? 'text-yellow-400'
													: 'text-muted-foreground/50 hover:text-yellow-400'
											)}
											onclick={(e) => togglePin(model.id, e)}
										>
											<StarIcon
												class={cn(
													isMobile.current ? 'size-4' : 'size-3.5',
													isPinned(model) && 'fill-current'
												)}
											/>
										</button>

										<!-- Mobile: Compact capability indicators -->
										{#if isMobile.current}
											<div class="ml-auto flex items-center gap-1">
												{#if nanoGPTModel && supportsVision(nanoGPTModel)}
													<div class="rounded bg-purple-500/20 p-1 text-purple-400">
														<EyeIcon class="size-3" />
													</div>
												{/if}
												{#if nanoGPTModel && supportsReasoning(nanoGPTModel)}
													<div class="rounded bg-green-500/20 p-1 text-green-400">
														<BrainIcon class="size-3" />
													</div>
												{/if}
												{#if nanoGPTModel && isImageOnlyModel(nanoGPTModel)}
													<div class="rounded bg-blue-500/20 p-1 text-blue-400">
														<ImageIcon class="size-3" />
													</div>
												{/if}
												{#if nanoGPTModel && supportsVideo(nanoGPTModel)}
													<div class="rounded bg-cyan-500/20 p-1 text-cyan-400">
														<VideoIcon class="size-3" />
													</div>
												{/if}
											</div>
										{/if}
									</div>
								</div>

								<!-- Capability badges - Desktop only with tooltips -->
								{#if !isMobile.current}
									<div class="flex flex-shrink-0 items-center gap-1.5">
										{#if nanoGPTModel && supportsVision(nanoGPTModel)}
											<Tooltip>
												{#snippet trigger(tooltip)}
													<div
														{...tooltip.trigger}
														class="rounded-md bg-purple-500/20 p-1.5 text-purple-400"
													>
														<EyeIcon class="size-3.5" />
													</div>
												{/snippet}
												Supports vision
											</Tooltip>
										{/if}

										{#if nanoGPTModel && supportsReasoning(nanoGPTModel)}
											<Tooltip>
												{#snippet trigger(tooltip)}
													<div
														{...tooltip.trigger}
														class="rounded-md bg-green-500/20 p-1.5 text-green-400"
													>
														<BrainIcon class="size-3.5" />
													</div>
												{/snippet}
												Supports reasoning
											</Tooltip>
										{/if}

										{#if nanoGPTModel && isImageOnlyModel(nanoGPTModel)}
											<Tooltip>
												{#snippet trigger(tooltip)}
													<div
														{...tooltip.trigger}
														class="rounded-md bg-blue-500/20 p-1.5 text-blue-400"
													>
														<ImageIcon class="size-3.5" />
													</div>
												{/snippet}
												Image generation
											</Tooltip>
										{/if}

										{#if nanoGPTModel && supportsVideo(nanoGPTModel)}
											<Tooltip>
												{#snippet trigger(tooltip)}
													<div
														{...tooltip.trigger}
														class="rounded-md bg-cyan-500/20 p-1.5 text-cyan-400"
													>
														<VideoIcon class="size-3.5" />
													</div>
												{/snippet}
												Supports video generation
											</Tooltip>
										{/if}

										<!-- Info button -->
										<Tooltip>
											{#snippet trigger(tooltip)}
												<button
													{...tooltip.trigger}
													class="text-muted-foreground/50 hover:text-muted-foreground rounded-full p-1 transition-colors"
													onclick={(e) => {
														e.stopPropagation();
														if (nanoGPTModel) {
															infoModel = infoModel?.id === nanoGPTModel.id ? null : nanoGPTModel;
														}
													}}
												>
													<InfoIcon class="size-4" />
												</button>
											{/snippet}
											Model info
										</Tooltip>
									</div>
								{/if}
							</Command.Item>
						{/each}
					</Command.List>
				</div>
			</Command.Root>
		</div>

		<!-- Info Panel - Desktop only, mobile uses full-screen overlay -->
		{#if infoModel && !isMobile.current}
			<ModelInfoPanel
				model={infoModel}
				iconUrl={getIconUrl(infoModel.icon_url, infoModel.id)}
				onClose={() => (infoModel = null)}
			/>
		{/if}
	</div>
{/snippet}

{#snippet trigger()}
	<div
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
	</div>
{/snippet}

<!-- Mobile Drawer -->
{#if isMobile.current}
	{@const CLOSE_THRESHOLD = 100}
	<button onclick={() => (open = true)} class={className}>
		{@render trigger()}
	</button>

	{#if open}
		<div
			class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
			transition:fade={{ duration: 150 }}
			onclick={() => (open = false)}
		></div>
		<div
			class="bg-background fixed inset-x-0 bottom-0 z-50 h-[85vh] touch-none rounded-t-xl border-t shadow-xl"
			style="transform: translateY({drawerTranslateY}px);"
			transition:fly={{ y: 100, duration: 200 }}
			ontouchstart={(e) => {
				// Track touch start position
				touchStartY = e.touches[0]?.clientY ?? 0;
				isDragging = true;
			}}
			ontouchmove={(e) => {
				if (!isDragging) return;
				e.preventDefault(); // Prevent pull-to-refresh
				const currentY = e.touches[0]?.clientY ?? 0;
				const deltaY = currentY - touchStartY;
				// Only allow dragging down
				drawerTranslateY = Math.max(0, deltaY);
			}}
			ontouchend={() => {
				isDragging = false;
				if (drawerTranslateY > CLOSE_THRESHOLD) {
					open = false;
				}
				drawerTranslateY = 0;
			}}
		>
			<!-- Drag handle area -->
			<div
				class="border-border flex cursor-grab items-center justify-center border-b p-3 active:cursor-grabbing"
			>
				<div class="bg-muted h-1.5 w-12 rounded-full"></div>
			</div>
			<div class="h-full w-full overflow-hidden pb-8">
				{@render pickerContent()}
			</div>
		</div>
	{/if}
{:else}
	<!-- Desktop Popover -->
	<Popover.Root bind:open>
		<Popover.Trigger>
			{@render trigger()}
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
				'flex flex-col overflow-hidden p-0 transition-all duration-200',
				infoModel ? 'w-[840px]' : 'w-[520px]',
				'h-[500px] max-h-[calc(100vh-120px)]',
				'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1'
			)}
		>
			{#if enabledArr.length === 0}
				<div class="text-muted-foreground flex items-center justify-center p-8">
					<p>Loading models...</p>
				</div>
			{:else}
				<div class="min-h-0 w-full flex-1">
					{@render pickerContent()}
				</div>

				<!-- Footer with pin shortcut -->
				{#if !isMobile.current && activeModelInfo}
					<div class="border-border flex place-items-center justify-between border-t p-2">
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
									{#each formatKeybind(keybinds.pinModel) as key}
										<Kbd size="xs">{key}</Kbd>
									{/each}
								</span>
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}
