<script lang="ts">
	import { goto } from '$app/navigation';
	import { shortcut, getKeybindOptions } from '$lib/actions/shortcut.svelte';
	import GlobalModal from '$lib/components/ui/modal/global-modal.svelte';
	import { models } from '$lib/state/models.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';
	import { browser } from '$app/environment';
	import { MetaTags } from 'svelte-meta-tags';
	import { page } from '$app/state';
	import { setupLastChat } from '$lib/state/last-chat.svelte';
	import { getTheme, applyTheme } from '$lib/themes/themes';
	import { session } from '$lib/state/session.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	const lastChat = setupLastChat();
	models.init();

	// Apply saved theme on mount
	onMount(async () => {
		if (browser && session.current?.user.id) {
			try {
				const response = await fetch('/api/db/user-settings', {
					method: 'GET',
					credentials: 'include',
				});
				if (response.ok) {
					const settings = await response.json();
					const theme = settings.theme ? getTheme(settings.theme) : null;
					applyTheme(theme, {
						primaryColor: settings.themePrimaryColor ?? null,
						accentColor: settings.themeAccentColor ?? null,
					});
				}
			} catch (error) {
				console.error('Failed to load theme:', error);
			}
		}
	});

	$effect(() => {
		if (page.url.pathname.startsWith('/chat')) {
			lastChat.current = page.params?.id ?? null;
		}
	});
</script>

<MetaTags
	title="nanochat"
	description="The OpenSource T3Chat alternative."
	keywords={['svelte', 't3', 'chat', 'ai']}
	twitter={{
		cardType: 'summary_large_image',
		title: 'nanochat',
		description: 'The OpenSource T3Chat alternative.',
		image: 'https://avatars.githubusercontent.com/u/251498604?s=200&v=4',
		creator: 'nanogpt-community',
	}}
	openGraph={{
		url: page.url.toString(),
		type: 'website',
		title: 'nanochat',
		description: 'The OpenSource T3Chat alternative.',
		siteName: 'nanochat',
		images: [
			{
				url: 'https://avatars.githubusercontent.com/u/251498604?s=200&v=4',
				width: 512,
				height: 512,
				alt: 'nanochat',
			},
		],
	}}
/>

<svelte:window use:shortcut={getKeybindOptions('newChat', () => goto('/chat'))} />

<ModeWatcher defaultMode="dark" />
{#if browser}
	{@render children()}
{/if}

<GlobalModal />
