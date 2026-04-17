<script lang="ts">
	import { page } from '$app/state';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { LocalToasts } from '$lib/builders/local-toasts.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Link } from '$lib/components/ui/link';
	import { session } from '$lib/state/session.svelte.js';
	import { Provider, type ProviderMeta } from '$lib/types';
	import KeyIcon from '~icons/lucide/key';
	import CheckIcon from '~icons/lucide/check';
	import ServerIcon from '~icons/lucide/server';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import { ResultAsync } from 'neverthrow';
	import { resource } from 'runed';
	import * as providers from '$lib/utils/providers';
	import type { UserKeyStatus, UserSettings } from '$lib/api';

	type Props = {
		provider: Provider;
		meta: ProviderMeta;
	};

	let { provider, meta }: Props = $props();
	const id = $props.id();

	const keyQuery = useCachedQuery<UserKeyStatus>(api.user_keys.get, () => ({
		provider,
	}));

	let keyInput = $state('');
	let loading = $state(false);
	const toasts = new LocalToasts({ id });

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const formData = new FormData(form);
		const key = `${formData.get('key') ?? ''}`.trim();
		if (!key || !session.current?.user.id) return;

		loading = true;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_keys.set.url,
				{
					provider,
					key,
				},
				{
					invalidatePatterns: [api.user_keys.get.url, api.user_enabled_models.get_enabled.url],
				}
			),
			(e) => e
		);

		toasts.addToast({
			data: {
				content: res.isOk() ? 'Saved' : 'Failed to save',
				variant: res.isOk() ? 'info' : 'danger',
			},
		});

		if (res.isOk()) {
			keyInput = '';
		}

		loading = false;
	}

	const apiKeyInfoResource = resource(
		() => ({
			hasKey: keyQuery.data?.hasKey ?? false,
			source: keyQuery.data?.source ?? null,
		}),
		async ({ hasKey, source }) => {
			if (!hasKey || source !== 'user') return null;

			if (provider === Provider.NanoGPT) {
				return (await providers.NanoGPT.getApiKey()).unwrapOr(null);
			}

			return null;
		}
	);

	function formatTokenPair(used: number, limit: number): { used: string; limit: string } {
		if (limit >= 1_000_000) {
			return {
				used: `${(used / 1_000_000).toFixed(1)}M`,
				limit: `${(limit / 1_000_000).toFixed(0)}M`,
			};
		}
		if (limit >= 1_000) {
			return {
				used: `${(used / 1_000).toFixed(1)}K`,
				limit: `${(limit / 1_000).toFixed(0)}K`,
			};
		}
		return { used: used.toString(), limit: limit.toString() };
	}

	const tokenDisplay = $derived.by(() => {
		const sub = apiKeyInfoResource.current?.subscription;
		if (!sub) return null;
		return formatTokenPair(sub.weeklyInputTokens.used, sub.weeklyInputTokens.limit);
	});

	const restrictions = $derived(page.data?.restrictions);
	const usingServerKeyWithRestrictions = $derived(
		restrictions?.usingServerKey && restrictions?.subscriptionOnly
	);

	const userSettingsQuery = useCachedQuery<UserSettings>(api.user_settings.get, {
		cache_scope: session.current?.user.id ?? 'anonymous',
	});

	const keyStatus = $derived<'none' | 'user' | 'server'>(
		!keyQuery.data?.hasKey ? 'none' : keyQuery.data.source === 'server' ? 'server' : 'user'
	);
</script>

<div class="bg-card border-border overflow-hidden rounded-lg border" {id}>
	<!-- Header -->
	<div class="border-border flex items-start justify-between gap-3 border-b p-5">
		<div class="flex items-center gap-3">
			<div class="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
				<KeyIcon class="size-4" />
			</div>
			<div class="flex flex-col">
				<h3 class="font-medium">{meta.title}</h3>
				<p class="text-muted-foreground text-xs">{meta.description}</p>
			</div>
		</div>

		<!-- Status badge -->
		{#if keyStatus === 'user'}
			<span
				class="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
			>
				<CheckIcon class="size-3" />
				Connected
			</span>
		{:else if keyStatus === 'server'}
			<span
				class="border-border text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
			>
				<ServerIcon class="size-3" />
				Server key
			</span>
		{/if}
	</div>

	<!-- Usage stats (only for user-provided NanoGPT key) -->
	{#if keyQuery.data?.hasKey}
		{#if apiKeyInfoResource.loading}
			<div class="border-border grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
				{#each Array(4) as _}
					<div class="bg-card h-[68px] animate-pulse p-4">
						<div class="bg-muted mb-2 h-3 w-16 rounded"></div>
						<div class="bg-muted h-5 w-20 rounded"></div>
					</div>
				{/each}
			</div>
		{:else if apiKeyInfoResource.current && provider === 'nanogpt'}
			{#if usingServerKeyWithRestrictions}
				<div class="border-border border-b p-5">
					<div class="flex flex-col gap-1">
						<span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Daily Message Limit
						</span>
						<div class="flex items-baseline gap-1.5">
							<span class="text-2xl font-semibold tabular-nums">
								{userSettingsQuery.data?.dailyMessagesUsed ?? 0}
							</span>
							<span class="text-muted-foreground text-sm tabular-nums">
								/ {restrictions?.dailyLimit || 'unlimited'}
							</span>
						</div>
						<p class="text-muted-foreground mt-2 text-xs">
							You're using the server API key. Add your own key for unlimited access.
						</p>
					</div>
				</div>
			{:else}
				<!-- 4 stat tiles -->
				<div class="border-border bg-border grid grid-cols-2 gap-px border-b sm:grid-cols-4">
					<div class="bg-card flex flex-col gap-1 p-4">
						<span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							USD Balance
						</span>
						<span class="font-mono text-lg font-semibold tabular-nums">
							${apiKeyInfoResource.current.balance.usd}
						</span>
					</div>
					<div class="bg-card flex flex-col gap-1 p-4">
						<span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Nano Balance
						</span>
						<span class="font-mono text-lg font-semibold tabular-nums">
							{apiKeyInfoResource.current.balance.nano}
							<span class="text-muted-foreground text-sm">Ӿ</span>
						</span>
					</div>
					<div class="bg-card flex flex-col gap-1 p-4">
						<span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Weekly Input
						</span>
						<div class="flex items-baseline gap-1">
							<span class="text-lg font-semibold tabular-nums">{tokenDisplay?.used}</span>
							<span class="text-muted-foreground text-xs tabular-nums">
								/ {tokenDisplay?.limit}
							</span>
						</div>
					</div>
					<div class="bg-card flex flex-col gap-1 p-4">
						<span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Daily Images
						</span>
						<div class="flex items-baseline gap-1">
							<span class="text-lg font-semibold tabular-nums">
								{apiKeyInfoResource.current.subscription.dailyImages.used}
							</span>
							<span class="text-muted-foreground text-xs tabular-nums">
								/ {apiKeyInfoResource.current.subscription.dailyImages.limit}
							</span>
						</div>
					</div>
				</div>
			{/if}
		{:else if keyQuery.data?.source === 'server'}
			<div class="border-border text-muted-foreground border-b px-5 py-3 text-xs">
				Server-managed keys do not expose balance or subscription details.
			</div>
		{:else}
			<div
				class="border-destructive/30 bg-destructive/5 text-destructive border-b px-5 py-3 text-xs"
			>
				We encountered an error while checking your usage. Please try again later.
			</div>
		{/if}
	{/if}

	<!-- Key form -->
	<form onsubmit={submit} class="flex flex-col gap-3 p-5">
		<div class="flex flex-col gap-2">
			<label for="{id}-key" class="text-sm font-medium">API Key</label>
			{#if keyQuery.isLoading}
				<div class="bg-input h-9 animate-pulse rounded-md"></div>
			{:else}
				<Input
					id="{id}-key"
					type="password"
					placeholder={keyStatus === 'server'
						? 'Using the server-managed key'
						: keyStatus === 'user'
							? 'Saved key on file. Enter a new key to replace it.'
							: (meta.placeholder ?? '')}
					autocomplete="off"
					name="key"
					bind:value={keyInput}
				/>
			{/if}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="text-muted-foreground text-xs">
					{#if keyStatus === 'server'}
						Using the server key. Enter your own key to override it.
					{:else if keyStatus === 'user'}
						A key is stored securely. Leave this blank to keep it unchanged.
					{:else}
						Get your API key from
						<Link
							href={meta.link}
							target="_blank"
							class="text-primary hover:text-primary/80 inline-flex items-center gap-0.5"
						>
							{meta.title}
							<ExternalLinkIcon class="size-3" />
						</Link>
					{/if}
				</span>
				<Button type="submit" size="sm" {loading} {...toasts.trigger} disabled={!keyInput.trim()}>
					Save Key
				</Button>
			</div>
		</div>
	</form>
</div>

{#each toasts.toasts as toast (toast)}
	<div {...toast.attrs} class={toast.class}>
		{toast.data.content}
	</div>
{/each}
