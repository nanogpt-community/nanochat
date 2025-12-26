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
					if (settings.theme) {
						const theme = getTheme(settings.theme);
						if (theme) {
							applyTheme(theme);
						}
					}
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
	title="thom.chat"
	description="The OpenSource T3Chat alternative."
	keywords={['svelte', 't3', 'chat', 'ai']}
	twitter={{
		cardType: 'summary_large_image',
		title: 'thom.chat',
		description: 'The OpenSource T3Chat alternative.',
		image: 'https://thom.chat/og.png',
		creator: '@thomasglopes',
	}}
	openGraph={{
		url: page.url.toString(),
		type: 'website',
		title: 'thom.chat',
		description: 'The OpenSource T3Chat alternative.',
		siteName: 'thom.chat',
		images: [
			{
				url: 'https://thom.chat/og.png',
				width: 2014,
				height: 1143,
				alt: 'thom.chat',
			},
		],
	}}
/>

<svelte:window use:shortcut={getKeybindOptions('newChat', () => goto('/chat'))} />

<ModeWatcher />
{#if browser}
	{@render children()}
{/if}

<GlobalModal />
