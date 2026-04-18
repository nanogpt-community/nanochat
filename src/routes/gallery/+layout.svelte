<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte.js';
	import PanelLeftIcon from '~icons/lucide/panel-left';
	import Settings2Icon from '~icons/lucide/settings-2';
	import EllipsisVerticalIcon from '~icons/lucide/ellipsis-vertical';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/light-switch/index.js';
	import { cn } from '$lib/utils/utils.js';

	let { children } = $props();
	let searchModalOpen = $state(false);
	let sidebarOpen = $state(false);
</script>

<Sidebar.Root bind:open={sidebarOpen} class="bg-sidebar fill-device-height overflow-clip">
	<AppSidebar bind:searchModalOpen />

	<Sidebar.Inset class="relative fill-device-height overflow-y-auto">
		<!-- Mobile header: fixed bar respecting iOS safe-area. Content below
		     reserves matching top padding. -->
		<div
			class="bg-background/85 border-border safe-area-pt safe-area-pl safe-area-pr fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b px-2 pb-2 backdrop-blur-lg md:hidden"
		>
			<Sidebar.Trigger class="tap-target flex size-10 items-center justify-center rounded-lg">
				<PanelLeftIcon class="size-5" />
			</Sidebar.Trigger>
			<div class="min-w-0 flex-1 text-center">
				<h1 class="truncate text-sm font-medium">Gallery</h1>
			</div>
			<div class="flex items-center gap-1">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="tap-target hover:bg-secondary flex size-10 items-center justify-center rounded-lg transition-colors"
						aria-label="Menu"
					>
						<EllipsisVerticalIcon class="size-5" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => (window.location.href = '/account')}>
							<Settings2Icon class="mr-2 size-4" />
							<span>Settings</span>
						</DropdownMenu.Item>
						<ThemeToggle
							label="Theme"
							wrapperClass="flex items-center justify-between px-2 py-1.5 text-sm"
							variant="ghost"
							class="size-6"
						/>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>

		{#if !sidebarOpen}
			<!-- Desktop header - top left -->
			<div
				class={cn(
					'bg-sidebar/50 fixed top-4 left-4 z-50 hidden w-fit rounded-lg p-1 backdrop-blur-lg transition-all duration-300 ease-in-out md:flex',
					{
						'md:left-(--sidebar-width)': sidebarOpen,
					}
				)}
			>
				<Tooltip>
					{#snippet trigger(tooltip)}
						<Sidebar.Trigger class="size-8" {...tooltip.trigger}>
							<PanelLeftIcon />
						</Sidebar.Trigger>
					{/snippet}
					Toggle Sidebar ({cmdOrCtrl} + B)
				</Tooltip>
			</div>
		{/if}

		<!-- Desktop header - top right -->
		<div
			class="bg-sidebar/50 fixed top-4 right-4 z-50 hidden rounded-lg p-1 backdrop-blur-lg md:flex"
		>
			<div class="flex items-center gap-1">
				<Tooltip>
					{#snippet trigger(tooltip)}
						<Button variant="ghost" size="icon" class="size-8" href="/account" {...tooltip.trigger}>
							<Settings2Icon />
						</Button>
					{/snippet}
					Settings
				</Tooltip>
				<ThemeToggle variant="ghost" class="size-8" />
			</div>
		</div>
		<div
			class="mx-auto w-full max-w-7xl px-3 pt-[calc(3rem+env(safe-area-inset-top)+0.5rem)] pb-4 md:px-6 md:py-6"
		>
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Root>
