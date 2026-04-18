<script lang="ts">
	import { settings } from '$lib/state/settings.svelte';
	import { cn } from '$lib/utils/utils';
	import * as Popover from '$lib/components/ui/popover';
	import { Command } from 'bits-ui';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ServerIcon from '~icons/lucide/server';
	import CheckIcon from '~icons/lucide/check';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';

	type Props = {
		class?: string;
		modelId?: string;
	};

	let { class: className, modelId }: Props = $props();

	// Provider info type based on NanoGPT API response
	type ProviderInfo = {
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
		defaultPrice?: {
			inputPer1kTokens: number;
			outputPer1kTokens: number;
		};
		providers: ProviderInfo[];
		error?: string;
	};

	let open = $state(false);
	let providers = $state<ProviderInfo[]>([]);
	let supportsSelection = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Track the model we last fetched providers for
	let lastFetchedModelId = $state<string | null>(null);

	// Fetch providers when model changes
	$effect(() => {
		const currentModelId = modelId || settings.modelId;
		if (currentModelId && currentModelId !== lastFetchedModelId) {
			fetchProviders(currentModelId);
		}
	});

	async function fetchProviders(currentModelId: string) {
		if (!currentModelId) return;

		loading = true;
		error = null;
		lastFetchedModelId = currentModelId;

		try {
			const response = await fetch(
				`/api/model-providers?modelId=${encodeURIComponent(currentModelId)}`
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				error = errorData.error || 'Failed to fetch providers';
				providers = [];
				supportsSelection = false;
				return;
			}

			const data: ModelProvidersResponse = await response.json();

			if (data.error) {
				error = data.error;
				providers = [];
				supportsSelection = false;
				return;
			}

			supportsSelection = data.supportsProviderSelection;
			providers = Array.isArray(data.providers)
				? data.providers.filter(
						(p): p is ProviderInfo =>
							!!p &&
							typeof p.provider === 'string' &&
							typeof p.available === 'boolean' &&
							p.available
					)
				: [];

			// Reset provider selection if model changed and current provider is not available
			if (settings.providerId && !providers.some((p) => p.provider === settings.providerId)) {
				settings.providerId = undefined;
			}
		} catch (e) {
			console.error('Error fetching providers:', e);
			error = 'Failed to fetch providers';
			providers = [];
			supportsSelection = false;
		} finally {
			loading = false;
		}
	}

	function selectProvider(providerId: string | undefined) {
		settings.providerId = providerId;
		open = false;
	}

	function formatProviderName(id: string): string {
		if (typeof id !== 'string' || id.length === 0) return 'Unknown';
		// Capitalize and format provider name
		return id
			.split(/[-_]/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function formatPrice(pricing: { inputPer1kTokens: number; outputPer1kTokens: number }): string {
		return `$${pricing.inputPer1kTokens.toFixed(4)}/$${pricing.outputPer1kTokens.toFixed(4)}`;
	}

	const isMobile = new IsMobile();

	const currentProviderName = $derived(
		settings.providerId ? formatProviderName(settings.providerId) : 'Auto'
	);

	// Don't show the picker if the model doesn't support provider selection
	const shouldShow = $derived(supportsSelection && providers.length > 0);
</script>

{#if shouldShow}
	<Popover.Root bind:open>
		<Popover.Trigger
			class={cn(
				'ring-offset-background focus:ring-ring hover:bg-accent flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
		>
			<Tooltip>
				{#snippet trigger(tooltip)}
					<div class="flex items-center gap-1.5" {...tooltip.trigger}>
						<ServerIcon class="text-muted-foreground size-3.5" />
						<span class="hidden max-w-[80px] truncate sm:inline">{currentProviderName}</span>
						<ChevronDownIcon class="text-muted-foreground size-3" />
					</div>
				{/snippet}
				Select upstream provider
			</Tooltip>
		</Popover.Trigger>

		<Popover.Content
			side="bottom"
			align="start"
			sideOffset={4}
			collisionPadding={20}
			hideWhenDetached={true}
			class={cn(
				'w-[280px] p-0',
				'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
				{
					'max-w-[calc(100vw-2rem)]': isMobile.current,
				}
			)}
		>
			{#if loading}
				<div class="text-muted-foreground flex items-center justify-center p-4">
					<p>Loading providers...</p>
				</div>
			{:else if error}
				<div class="text-destructive p-4 text-sm">
					<p>{error}</p>
				</div>
			{:else}
				<Command.Root class="flex h-full w-full flex-col overflow-hidden">
					<Command.List class="overflow-y-auto p-1" style="max-height: 300px;">
						<!-- Auto option (platform default) -->
						<Command.Item
							value="auto"
							class={cn(
								'flex rounded-lg p-2',
								'relative cursor-pointer select-none',
								'hover:bg-accent/50 hover:text-accent-foreground',
								'items-center justify-between',
								!settings.providerId && 'bg-accent/50'
							)}
							onSelect={() => selectProvider(undefined)}
						>
							<div class="flex items-center gap-2">
								<p class="text-sm font-medium">Auto</p>
								<span class="text-muted-foreground text-xs">(Platform default)</span>
							</div>
							{#if !settings.providerId}
								<CheckIcon class="text-primary size-4" />
							{/if}
						</Command.Item>

						<!-- Divider -->
						<div class="bg-border my-1 h-px"></div>

						<!-- Provider options -->
						{#each providers as provider (provider.provider)}
							<Command.Item
								value={provider.provider}
								class={cn(
									'flex rounded-lg p-2',
									'relative cursor-pointer select-none',
									'hover:bg-accent/50 hover:text-accent-foreground',
									'items-center justify-between',
									settings.providerId === provider.provider && 'bg-accent/50'
								)}
								onSelect={() => selectProvider(provider.provider)}
							>
								<div class="flex flex-col gap-0.5">
									<p class="text-sm font-medium">{formatProviderName(provider.provider)}</p>
									<span class="text-muted-foreground text-xs">
										{formatPrice(provider.pricing)} per 1k tokens
									</span>
								</div>
								{#if settings.providerId === provider.provider}
									<CheckIcon class="text-primary size-4" />
								{/if}
							</Command.Item>
						{/each}
					</Command.List>

					<!-- Footer info -->
					<div class="border-border border-t p-2">
						<p class="text-muted-foreground text-xs">Provider selection includes a 5% markup</p>
					</div>
				</Command.Root>
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}
