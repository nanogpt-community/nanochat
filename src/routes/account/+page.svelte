<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { ResultAsync } from 'neverthrow';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Switch } from '$lib/components/ui/switch';

	const settings = useCachedQuery(api.user_settings.get, {});

	let privacyMode = $derived(settings.data?.privacyMode ?? false);
	let contextMemoryEnabled = $derived(settings.data?.contextMemoryEnabled ?? false);
	let persistentMemoryEnabled = $derived(settings.data?.persistentMemoryEnabled ?? false);

	async function togglePrivacyMode(v: boolean) {
		privacyMode = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				privacyMode: v,
			}),
			(e) => e
		);

		if (res.isErr()) privacyMode = !v;
	}

	async function toggleContextMemory(v: boolean) {
		contextMemoryEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				contextMemoryEnabled: v,
			}),
			(e) => e
		);

		if (res.isErr()) contextMemoryEnabled = !v;
	}

	async function togglePersistentMemory(v: boolean) {
		persistentMemoryEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				persistentMemoryEnabled: v,
			}),
			(e) => e
		);

		if (res.isErr()) persistentMemoryEnabled = !v;
	}
</script>

<svelte:head>
	<title>Account | not t3.chat</title>
</svelte:head>

<h1 class="text-2xl font-bold">Account Settings</h1>
<h2 class="text-muted-foreground mt-2 text-sm">Configure the settings for your account.</h2>

<div class="mt-4 flex flex-col gap-4">
	<div class="flex place-items-center justify-between">
		<div class="flex flex-col gap-1">
			<span>Hide Personal Information</span>
			<span class="text-muted-foreground text-sm">Blur your name and avatar in the sidebar.</span>
		</div>
		<Switch bind:value={() => privacyMode, togglePrivacyMode} />
	</div>
	<div class="flex place-items-center justify-between">
		<div class="flex flex-col gap-1">
			<span>Context Memory</span>
			<span class="text-muted-foreground text-sm">Compress long conversations for better context retention.</span>
		</div>
		<Switch bind:value={() => contextMemoryEnabled, toggleContextMemory} />
	</div>
	<div class="flex place-items-center justify-between">
		<div class="flex flex-col gap-1">
			<span>Persistent Memory</span>
			<span class="text-muted-foreground text-sm">Remember facts about you across different conversations.</span>
		</div>
		<Switch bind:value={() => persistentMemoryEnabled, togglePersistentMemory} />
	</div>
</div>
