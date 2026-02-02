<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { active } from '$lib/actions/active.svelte';
	import { authClient } from '$lib/backend/auth/client.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ThemeToggle } from '$lib/components/ui/light-switch';
	import ArrowLeftIcon from '~icons/lucide/arrow-left';
	import GithubIcon from '~icons/lucide/github';
	import CameraIcon from '~icons/lucide/camera';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import { Avatar } from 'melt/components';
	import { Kbd } from '$lib/components/ui/kbd/index.js';
	import { formatKeybind } from '$lib/hooks/is-mac.svelte.js';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { cn } from '$lib/utils/utils.js';
	import { useLastChat } from '$lib/state/last-chat.svelte.js';
	import { keybinds, KEYBIND_LABELS, KEYBIND_ACTIONS } from '$lib/state/keybinds.svelte';
	import type { UserSettings } from '$lib/api';

	let { data, children } = $props();

	const settings = useCachedQuery<UserSettings>(api.user_settings.get, {
		session_token: session.current?.session.token ?? '',
	});
	const themeToggleSettings = $derived({
		theme: settings.data?.theme,
		isLoading: settings.isLoading,
		error: settings.error,
	});

	const navigation: { title: string; href: string }[] = [
		{
			title: 'Account',
			href: '/account',
		},
		{
			title: 'Assistants',
			href: '/account/assistants',
		},
		{
			title: 'Prompts',
			href: '/account/prompts',
		},
		{
			title: 'Customization',
			href: '/account/customization',
		},
		{
			title: 'Models',
			href: '/account/models',
		},
		{
			title: 'API Keys',
			href: '/account/api-keys',
		},
		{
			title: 'Keybinds',
			href: '/account/keybinds',
		},
		{
			title: 'Analytics',
			href: '/account/analytics',
		},
		{
			title: 'Starred',
			href: '/account/starred',
		},
		{
			title: 'Developer',
			href: '/account/developer',
		},
	];
	// Use first 5 actions for the shortcuts display (global ones)
	const displayedActions = KEYBIND_ACTIONS.slice(0, 5);

	async function signOut() {
		await authClient.signOut();

		await goto('/login');
	}

	const backToChat = '/chat';

	// Avatar upload state
	let avatarUploading = $state(false);
	let avatarError = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	async function handleAvatarUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		avatarError = null;
		avatarUploading = true;

		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch('/api/user/upload-avatar', {
				method: 'POST',
				body: formData,
				credentials: 'include',
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || `Upload failed: ${response.statusText}`);
			}

			// Refresh session and page data to reflect new avatar
			await invalidateAll();
		} catch (err) {
			avatarError = err instanceof Error ? err.message : 'Failed to upload avatar';
			console.error('Avatar upload error:', err);
		} finally {
			avatarUploading = false;
			// Reset file input
			if (input) input.value = '';
		}
	}
</script>

<div class="container mx-auto max-w-[1200px] space-y-8 pt-6 pb-24">
	<header class="flex place-items-center justify-between px-4">
		<Button href={backToChat} variant="ghost" class="flex place-items-center gap-2 text-sm">
			<ArrowLeftIcon class="size-4" />
			Back to Chat
		</Button>
		<div class="flex place-items-center gap-2">
			<ThemeToggle variant="ghost" settings={themeToggleSettings} />
			<Button variant="ghost" onClickPromise={signOut}>Sign out</Button>
		</div>
	</header>
	<div class="px-4 md:grid md:grid-cols-[255px_1fr]">
		<div class="hidden md:col-start-1 md:block">
			<div class="flex flex-col place-items-center gap-2">
				<!-- Hidden file input for avatar upload -->
				<input
					type="file"
					accept="image/jpeg,image/png,image/gif,image/webp"
					class="hidden"
					bind:this={fileInput}
					onchange={handleAvatarUpload}
				/>

				<!-- Avatar with upload overlay -->
				<button
					type="button"
					class="group relative cursor-pointer"
					onclick={() => fileInput?.click()}
					disabled={avatarUploading}
				>
					<Avatar src={data.session.user.image ?? undefined}>
						{#snippet children(avatar)}
							<img
								{...avatar.image}
								alt="Your avatar"
								class={cn('size-40 rounded-full', {
									'blur-[20px]': settings.data?.privacyMode,
								})}
							/>
							<span
								{...avatar.fallback}
								class={cn(
									'bg-muted flex size-40 items-center justify-center rounded-full text-4xl font-semibold',
									{
										'blur-[20px]': settings.data?.privacyMode,
									}
								)}
							>
								{data.session.user.name
									.split(' ')
									.map((i) => i[0]?.toUpperCase())
									.join('')}
							</span>
						{/snippet}
					</Avatar>
					<!-- Upload overlay -->
					<div
						class={cn(
							'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100',
							avatarUploading && 'opacity-100'
						)}
					>
						{#if avatarUploading}
							<LoaderCircle class="size-10 animate-spin text-white" />
						{:else}
							<CameraIcon class="size-10 text-white" />
						{/if}
					</div>
				</button>

				{#if avatarError}
					<p class="text-destructive text-center text-sm">{avatarError}</p>
				{/if}
				<div class="flex flex-col gap-1">
					<p
						class={cn('text-center text-2xl font-bold', {
							'blur-[6px]': settings.data?.privacyMode,
						})}
					>
						{data.session.user.name}
					</p>
					<span
						class={cn('text-muted-foreground text-center text-sm', {
							'blur-[6px]': settings.data?.privacyMode,
						})}
					>
						{data.session.user.email}
					</span>
				</div>
				<div class="mt-4 flex w-full flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium">Keyboard Shortcuts</span>
						<a href="/account/keybinds" class="text-primary text-xs hover:underline">Edit</a>
					</div>
					<div class="flex flex-col gap-1">
						{#each displayedActions as action (action)}
							<div class="flex place-items-center justify-between">
								<span class="text-muted-foreground text-sm">{KEYBIND_LABELS[action]}</span>

								<div class="flex place-items-center gap-1">
									{#each formatKeybind(keybinds[action]) as key (key)}
										<Kbd>{key}</Kbd>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
				<a
					href="https://github.com/nanogpt-community/nanochat"
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground mt-6 flex items-center gap-2 text-sm transition-colors"
				>
					<GithubIcon class="size-4" />
					<span>View on GitHub</span>
				</a>
			</div>
		</div>
		<div class="md:col-start-2 md:pl-12">
			<div
				class="bg-accent scrollbar-hide text-muted-foreground flex w-fit max-w-full place-items-center gap-2 overflow-x-auto rounded-lg p-1 text-sm"
			>
				{#each navigation as tab (tab)}
					<a
						href={tab.href}
						use:active={{ activeForSubdirectories: false }}
						class="data-[active=true]:bg-background data-[active=true]:text-foreground rounded-md px-2 py-1 text-nowrap"
					>
						{tab.title}
					</a>
				{/each}
			</div>
			<div class="pt-8">
				{@render children?.()}
			</div>
		</div>
	</div>
</div>
