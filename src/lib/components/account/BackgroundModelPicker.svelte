<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import type { UserSettings } from '$lib/api';

	type ProviderInfo = {
		provider: string;
		pricing: { inputPer1kTokens: number; outputPer1kTokens: number };
		available: boolean;
	};
	type ModelKey = 'titleModelId' | 'followUpModelId' | 'memoryModelId' | 'utilityModelId';
	type ProviderKey =
		'titleProviderId' | 'followUpProviderId' | 'memoryProviderId' | 'utilityProviderId';

	let {
		id,
		label,
		hint,
		defaultLabel,
		modelKey,
		providerKey,
		models,
	}: {
		id: string;
		label: string;
		hint: string;
		defaultLabel: string;
		modelKey: ModelKey;
		providerKey: ProviderKey;
		models: { value: string; label: string }[];
	} = $props();

	const settings = useCachedQuery<UserSettings>(api.user_settings.get, {});

	let modelId = $state('');
	let providerId = $state('');
	let providers = $state<ProviderInfo[]>([]);
	let supportsProviders = $state(false);

	$effect(() => {
		modelId = settings.data?.[modelKey] ?? '';
		providerId = settings.data?.[providerKey] ?? '';
	});

	$effect(() => {
		if (!modelId) {
			providers = [];
			supportsProviders = false;
			return;
		}
		fetch(`/api/model-providers?modelId=${encodeURIComponent(modelId)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				supportsProviders = data?.supportsProviderSelection ?? false;
				providers = (data?.providers ?? []).filter((p: ProviderInfo) => p.available);
				// A provider chosen for a previous model may not serve this one.
				if (providerId && !providers.some((p) => p.provider === providerId)) {
					providerId = '';
					save({ [providerKey]: '' });
				}
			})
			.catch(() => {
				providers = [];
				supportsProviders = false;
			});
	});

	function save(fields: Record<string, string>) {
		return mutate(
			api.user_settings.set.url,
			{ action: 'update', ...fields },
			{ invalidatePatterns: [api.user_settings.get.url] }
		);
	}

	const formatName = (id: string) =>
		id
			.split(/[-_]/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	const formatPrice = (p: ProviderInfo['pricing']) =>
		`$${p.inputPer1kTokens.toFixed(4)}/$${p.outputPer1kTokens.toFixed(4)}`;

	const selectClass =
		'border-input bg-background focus:ring-ring flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none';
</script>

<div class="flex flex-col gap-2">
	<label for={id} class="text-sm font-medium">{label}</label>
	<select
		{id}
		class={selectClass}
		value={modelId}
		onchange={(e) => {
			modelId = e.currentTarget.value;
			save({ [modelKey]: modelId });
		}}
	>
		<option value="">Default ({defaultLabel})</option>
		{#each models as model (model.value)}
			<option value={model.value}>{model.label}</option>
		{/each}
	</select>
	{#if supportsProviders && providers.length > 0}
		<select
			class="{selectClass} mt-1"
			value={providerId}
			onchange={(e) => {
				providerId = e.currentTarget.value;
				save({ [providerKey]: providerId });
			}}
		>
			<option value="">Provider: Auto</option>
			{#each providers as provider (provider.provider)}
				<option value={provider.provider}>
					{formatName(provider.provider)} ({formatPrice(provider.pricing)})
				</option>
			{/each}
		</select>
	{/if}
	<p class="text-muted-foreground text-xs">{hint}</p>
</div>
