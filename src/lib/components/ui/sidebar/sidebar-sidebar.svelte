<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebarSidebar } from './sidebar.svelte.js';

	let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();

	const sidebar = useSidebarSidebar();
</script>

{#if sidebar.root.showSidebar}
	{#if sidebar.root.isMobile.current}
		<div
			class="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
			onclick={() => sidebar.root.closeMobile()}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && sidebar.root.closeMobile()}
		></div>
	{/if}

	<div
		{...rest}
		class={cn(
			'bg-sidebar border-sidebar-border fill-device-height col-start-1 w-[--sidebar-width] border-r',
			sidebar.root.isMobile.current && 'fixed inset-y-0 left-0 z-50 h-[100dvh] drop-shadow-xl',
			className
		)}
	>
		{@render children?.()}
	</div>
{/if}
