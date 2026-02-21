<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebarSidebar } from './sidebar.svelte.js';

	let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();

	const sidebar = useSidebarSidebar();

	let isResizing = $state(false);
	let resizeStartX = $state(0);
	let resizeStartWidth = $state(0);

	function handleResizeStart(event: PointerEvent) {
		if (sidebar.root.isMobile.current) return;
		event.preventDefault();
		isResizing = true;
		resizeStartX = event.clientX;
		resizeStartWidth = sidebar.root.width;
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
	}

	function handleResizeMove(event: PointerEvent) {
		if (!isResizing) return;
		const nextWidth = resizeStartWidth + (event.clientX - resizeStartX);
		sidebar.root.setWidth(nextWidth);
	}

	function handleResizeStop() {
		isResizing = false;
	}
</script>

<svelte:window onpointermove={handleResizeMove} onpointerup={handleResizeStop} />

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
			'bg-sidebar border-sidebar-border fill-device-height relative col-start-1 w-[--sidebar-width] border-r',
			sidebar.root.isMobile.current && 'fixed inset-y-0 left-0 z-50 h-[100dvh] drop-shadow-xl',
			className
		)}
	>
		{#if !sidebar.root.isMobile.current}
			<div
				class="absolute top-0 right-0 z-20 h-full w-2.5 cursor-col-resize touch-none select-none bg-sidebar/0 transition-colors hover:bg-sidebar/20"
				onpointerdown={handleResizeStart}
				role="separator"
			>
				<div class="bg-sidebar-foreground/40 absolute right-1 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full"></div>
			</div>
		{/if}
		{@render children?.()}
	</div>
{/if}
