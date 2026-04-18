<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { active } from '$lib/actions/active.svelte';
	import { authClient } from '$lib/backend/auth/client.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ThemeToggle } from '$lib/components/ui/light-switch';
	import ArrowLeftIcon from '~icons/lucide/arrow-left';
	import GithubIcon from '~icons/lucide/github';
	import CameraIcon from '~icons/lucide/camera';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import UserIcon from '~icons/lucide/user';
	import SparklesIcon from '~icons/lucide/sparkles';
	import MessageSquareIcon from '~icons/lucide/message-square-text';
	import CalendarIcon from '~icons/lucide/calendar-clock';
	import PaletteIcon from '~icons/lucide/palette';
	import CpuIcon from '~icons/lucide/cpu';
	import KeyIcon from '~icons/lucide/key';
	import KeyboardIcon from '~icons/lucide/keyboard';
	import BarChartIcon from '~icons/lucide/bar-chart-3';
	import StarIcon from '~icons/lucide/star';
	import CodeIcon from '~icons/lucide/code';
	import { Avatar } from 'melt/components';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { cn } from '$lib/utils/utils.js';

	import type { UserSettings } from '$lib/api';

	let { data, children } = $props();
	const currentSession = $derived(data.session!);

	const settings = useCachedQuery<UserSettings>(api.user_settings.get, {
		cache_scope: session.current?.user.id ?? 'anonymous',
	});
	const themeToggleSettings = $derived({
		theme: settings.data?.theme,
		isLoading: settings.isLoading,
		error: settings.error,
	});

	type NavItem = { title: string; href: string; icon: typeof UserIcon };
	type NavGroup = { label: string; items: NavItem[] };

	const navGroups: NavGroup[] = [
		{
			label: 'Profile',
			items: [
				{ title: 'Account', href: '/account', icon: UserIcon },
				{ title: 'Customization', href: '/account/customization', icon: PaletteIcon },
				{ title: 'Keybinds', href: '/account/keybinds', icon: KeyboardIcon },
			],
		},
		{
			label: 'AI',
			items: [
				{ title: 'Assistants', href: '/account/assistants', icon: SparklesIcon },
				{ title: 'Prompts', href: '/account/prompts', icon: MessageSquareIcon },
				{ title: 'Models', href: '/account/models', icon: CpuIcon },
				{ title: 'Schedules', href: '/account/schedules', icon: CalendarIcon },
			],
		},
		{
			label: 'Data',
			items: [
				{ title: 'Analytics', href: '/account/analytics', icon: BarChartIcon },
				{ title: 'Starred', href: '/account/starred', icon: StarIcon },
				{ title: 'API Keys', href: '/account/api-keys', icon: KeyIcon },
				{ title: 'Developer', href: '/account/developer', icon: CodeIcon },
			],
		},
	];

	const flatNav = $derived(navGroups.flatMap((g) => g.items));
	const currentPath = $derived(page.url.pathname);
	const currentNavItem = $derived(flatNav.find((i) => i.href === currentPath) ?? flatNav[0]);

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

<div
	class="container mx-auto max-w-[1200px] px-4 pb-24"
	style="padding-top: max(1.5rem, env(safe-area-inset-top)); padding-bottom: calc(6rem + env(safe-area-inset-bottom)); padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right));"
>
	<header class="flex place-items-center justify-between">
		<Button href={backToChat} variant="ghost" class="flex place-items-center gap-2 text-sm">
			<ArrowLeftIcon class="size-4" />
			Back to Chat
		</Button>
		<div class="flex place-items-center gap-2">
			<ThemeToggle variant="ghost" settings={themeToggleSettings} />
			<Button variant="ghost" onClickPromise={signOut}>Sign out</Button>
		</div>
	</header>

	<!-- Hidden file input for avatar upload -->
	<input
		type="file"
		accept="image/jpeg,image/png,image/gif,image/webp"
		class="hidden"
		bind:this={fileInput}
		onchange={handleAvatarUpload}
	/>

	<div class="mt-8 md:grid md:grid-cols-[240px_1fr] md:gap-10">
		<!-- Sidebar (desktop) -->
		<aside class="hidden md:col-start-1 md:block">
			<div class="sticky top-6 flex flex-col gap-6">
				<!-- Profile header -->
				<div class="flex items-center gap-3">
					<button
						type="button"
						class="group relative shrink-0 cursor-pointer"
						onclick={() => fileInput?.click()}
						disabled={avatarUploading}
						aria-label="Upload avatar"
					>
						<Avatar src={currentSession.user.image ?? undefined}>
							{#snippet children(avatar)}
								<img
									{...avatar.image}
									alt="Your avatar"
									class={cn('size-12 rounded-full object-cover', {
										'blur-[8px]': settings.data?.privacyMode,
									})}
								/>
								<span
									{...avatar.fallback}
									class={cn(
										'bg-muted flex size-12 items-center justify-center rounded-full text-base font-semibold',
										{ 'blur-[8px]': settings.data?.privacyMode }
									)}
								>
									{currentSession.user.name
										.split(' ')
										.map((i) => i[0]?.toUpperCase())
										.join('')}
								</span>
							{/snippet}
						</Avatar>
						<div
							class={cn(
								'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100',
								avatarUploading && 'opacity-100'
							)}
						>
							{#if avatarUploading}
								<LoaderCircle class="size-5 animate-spin text-white" />
							{:else}
								<CameraIcon class="size-5 text-white" />
							{/if}
						</div>
					</button>
					<div class="flex min-w-0 flex-col">
						<p
							class={cn('truncate text-sm font-semibold', {
								'blur-[4px]': settings.data?.privacyMode,
							})}
						>
							{currentSession.user.name}
						</p>
						<p
							class={cn('text-muted-foreground truncate text-xs', {
								'blur-[4px]': settings.data?.privacyMode,
							})}
						>
							{currentSession.user.email}
						</p>
					</div>
				</div>

				{#if avatarError}
					<p class="text-destructive text-xs">{avatarError}</p>
				{/if}

				<!-- Grouped vertical nav -->
				<nav class="flex flex-col gap-5">
					{#each navGroups as group (group.label)}
						<div class="flex flex-col gap-1">
							<p
								class="text-muted-foreground px-2 text-[11px] font-semibold tracking-wider uppercase"
							>
								{group.label}
							</p>
							{#each group.items as item (item.href)}
								{@const Icon = item.icon}
								{@const isActive = currentPath === item.href}
								<a
									href={item.href}
									class={cn(
										'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
										isActive
											? 'bg-accent text-foreground font-medium'
											: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
									)}
								>
									<Icon
										class={cn(
											'size-4 shrink-0',
											isActive ? 'text-primary' : 'text-muted-foreground/70'
										)}
									/>
									<span class="truncate">{item.title}</span>
								</a>
							{/each}
						</div>
					{/each}
				</nav>

				<!-- Footer -->
				<div class="border-border border-t pt-4">
					<a
						href="https://github.com/nanogpt-community/nanochat"
						target="_blank"
						rel="noopener noreferrer"
						class="text-muted-foreground hover:text-foreground flex items-center gap-2 px-2 text-xs transition-colors"
					>
						<GithubIcon class="size-3.5" />
						<span>View on GitHub</span>
					</a>
				</div>
			</div>
		</aside>

		<!-- Content -->
		<div class="md:col-start-2 md:min-w-0">
			<!-- Mobile nav: select dropdown -->
			<div class="mb-6 md:hidden">
				<div class="mb-3 flex items-center gap-3">
					<button
						type="button"
						class="group relative shrink-0 cursor-pointer"
						onclick={() => fileInput?.click()}
						disabled={avatarUploading}
						aria-label="Upload avatar"
					>
						<Avatar src={currentSession.user.image ?? undefined}>
							{#snippet children(avatar)}
								<img
									{...avatar.image}
									alt="Your avatar"
									class={cn('size-10 rounded-full object-cover', {
										'blur-[8px]': settings.data?.privacyMode,
									})}
								/>
								<span
									{...avatar.fallback}
									class={cn(
										'bg-muted flex size-10 items-center justify-center rounded-full text-sm font-semibold',
										{ 'blur-[8px]': settings.data?.privacyMode }
									)}
								>
									{currentSession.user.name
										.split(' ')
										.map((i) => i[0]?.toUpperCase())
										.join('')}
								</span>
							{/snippet}
						</Avatar>
					</button>
					<div class="flex min-w-0 flex-col">
						<p
							class={cn('truncate text-sm font-semibold', {
								'blur-[4px]': settings.data?.privacyMode,
							})}
						>
							{currentSession.user.name}
						</p>
						<p
							class={cn('text-muted-foreground truncate text-xs', {
								'blur-[4px]': settings.data?.privacyMode,
							})}
						>
							{currentSession.user.email}
						</p>
					</div>
				</div>
				<label for="account-nav-select" class="sr-only">Settings page</label>
				<select
					id="account-nav-select"
					class="border-input bg-background focus:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
					value={currentPath}
					onchange={(e) => goto(e.currentTarget.value)}
				>
					{#each navGroups as group (group.label)}
						<optgroup label={group.label}>
							{#each group.items as item (item.href)}
								<option value={item.href}>{item.title}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>

			{@render children?.()}
		</div>
	</div>
</div>
