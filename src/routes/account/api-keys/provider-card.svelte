<script lang="ts">
	import { page } from '$app/state';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { LocalToasts } from '$lib/builders/local-toasts.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Link } from '$lib/components/ui/link';
	import { session } from '$lib/state/session.svelte.js';
	import { Provider, type ProviderMeta } from '$lib/types';
	import KeyIcon from '~icons/lucide/key';
	import { ResultAsync } from 'neverthrow';
	import { resource } from 'runed';
	import * as providers from '$lib/utils/providers';

	type Props = {
		provider: Provider;
		meta: ProviderMeta;
	};

	let { provider, meta }: Props = $props();
	const id = $props.id();

	const keyQuery = useCachedQuery(api.user_keys.get, () => ({
		provider,
	}));

	let loading = $state(false);
	const toasts = new LocalToasts({ id });

	async function submit(e: SubmitEvent) {
		loading = true;

		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const formData = new FormData(form);
		const key = formData.get('key');
		if (key === null || !session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_keys.set.url,
				{
					provider,
					key: `${key}`,
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

		loading = false;
	}

	const apiKeyInfoResource = resource(
		() => keyQuery.data,
		async (key) => {
			if (!key) return null;

			if (provider === Provider.NanoGPT) {
				return (await providers.NanoGPT.getApiKey(key)).unwrapOr(null);
			}

			return null;
		}
	);

	// Get restrictions for showing daily limit instead of NanoGPT usage
	const restrictions = $derived(page.data?.restrictions);
	const usingServerKeyWithRestrictions = $derived(
		restrictions?.usingServerKey && restrictions?.subscriptionOnly
	);

	// Query for user's daily limit usage
	const userSettingsQuery = useCachedQuery(api.user_settings.get, {
		session_token: session.current?.session.token ?? '',
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title id={provider}>
			<KeyIcon class="inline size-4" />
			{meta.title}
		</Card.Title>
		<Card.Description>{meta.description}</Card.Description>
	</Card.Header>
	<Card.Content tag="form" onsubmit={submit}>
		<div class="flex flex-col gap-1">
			{#if keyQuery.isLoading}
				<div class="bg-input h-9 animate-pulse rounded-md"></div>
			{:else}
				<Input
					type="password"
					placeholder={meta.placeholder ?? ''}
					autocomplete="off"
					name="key"
					value={keyQuery.data!}
				/>
			{/if}
			{#if keyQuery.data}
				{#if apiKeyInfoResource.loading}
					<div class="bg-input h-6 w-[200px] animate-pulse rounded-md"></div>
				{:else if apiKeyInfoResource.current}
					{#if provider === 'nanogpt'}
						{#if usingServerKeyWithRestrictions}
							<!-- Show daily message limit for server key users -->
							<div class="bg-muted/50 mt-2 flex flex-col gap-2 rounded-lg p-3 text-xs">
								<div class="flex flex-col">
									<span class="text-muted-foreground">Daily Message Limit</span>
									<div class="flex items-end gap-1">
										<span class="font-medium">{userSettingsQuery.data?.dailyMessagesUsed ?? 0}</span
										>
										<span class="text-muted-foreground mb-px"
											>/ {restrictions?.dailyLimit || 'unlimited'}</span
										>
									</div>
								</div>
								<p class="text-muted-foreground mt-1">
									You're using the server API key. Add your own key for unlimited access.
								</p>
							</div>
						{:else}
							<div class="bg-muted/50 mt-2 flex flex-col gap-2 rounded-lg p-3 text-xs">
								<div class="grid grid-cols-2 gap-x-4 gap-y-2">
									<div class="flex flex-col">
										<span class="text-muted-foreground">USD Balance</span>
										<span class="font-mono">${apiKeyInfoResource.current.balance.usd}</span>
									</div>
									<div class="flex flex-col">
										<span class="text-muted-foreground">Nano Balance</span>
										<span class="font-mono">{apiKeyInfoResource.current.balance.nano} Ӿ</span>
									</div>
								</div>

								<div class="bg-border my-1 h-px"></div>

								<div class="grid grid-cols-2 gap-x-4 gap-y-2">
									<div class="flex flex-col">
										<span class="text-muted-foreground">Daily Usage</span>
										<div class="flex items-end gap-1">
											<span class="font-medium"
												>{apiKeyInfoResource.current.subscription.daily.used}</span
											>
											<span class="text-muted-foreground mb-px"
												>/ {apiKeyInfoResource.current.subscription.daily.limit}</span
											>
										</div>
									</div>
									<div class="flex flex-col">
										<span class="text-muted-foreground">Monthly Usage</span>
										<div class="flex items-end gap-1">
											<span class="font-medium"
												>{apiKeyInfoResource.current.subscription.monthly.used}</span
											>
											<span class="text-muted-foreground mb-px"
												>/ {apiKeyInfoResource.current.subscription.monthly.limit}</span
											>
										</div>
									</div>
								</div>
							</div>
						{/if}
					{:else}
						<span class="text-muted-foreground flex h-6 place-items-center text-xs">
							${(apiKeyInfoResource.current?.usage ?? 0).toFixed(3)} used ・ ${(
								apiKeyInfoResource.current?.limit_remaining ?? 0
							).toFixed(3)} remaining
						</span>
					{/if}
				{:else}
					<span
						class="flex h-6 w-fit place-items-center rounded-lg bg-red-500/50 px-2 text-xs text-red-500"
					>
						We encountered an error while trying to check your usage. Please try again later.
					</span>
				{/if}
			{:else}
				<span class="text-muted-foreground text-xs">
					Get your API key from
					<Link href={meta.link} target="_blank" class="text-blue-500">
						{meta.title}
					</Link>
				</span>
			{/if}
		</div>
		<div class="flex justify-end">
			<Button {loading} type="submit" {...toasts.trigger}>Save</Button>
		</div>
	</Card.Content>
</Card.Root>

{#each toasts.toasts as toast (toast)}
	<div {...toast.attrs} class={toast.class}>
		{toast.data.content}
	</div>
{/each}
