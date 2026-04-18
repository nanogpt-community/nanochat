<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebarSidebar } from './sidebar.svelte.js';
	import { fade } from 'svelte/transition';

	let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();

	const sidebar = useSidebarSidebar();

	// ---------------------------------------------------------------------------
	// Desktop resize handle
	// ---------------------------------------------------------------------------
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

	// ---------------------------------------------------------------------------
	// Lock body scroll while the mobile drawer is open.
	// ---------------------------------------------------------------------------
	$effect(() => {
		if (typeof document === 'undefined') return;
		const isMobileOpen = sidebar.root.isMobile.current && sidebar.root.openMobile;
		if (isMobileOpen) {
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
			};
		}
	});

	// ---------------------------------------------------------------------------
	// Swipe-to-close (follow-finger). We grab pointer capture so the rest of
	// the UI cannot receive taps while the user is dragging the drawer.
	// ---------------------------------------------------------------------------
	const CLOSE_THRESHOLD = 80; // px the drawer must be dragged left to close
	const HORIZ_BIAS = 1.1; // horizontal motion must be clearly > vertical

	let draggingPointerId: number | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragDx = $state(0);
	let dragCancelled = false;

	function onDrawerPointerDown(e: PointerEvent) {
		if (!sidebar.root.isMobile.current) return;
		// Don't start a close-drag from pointer events inside buttons/inputs —
		// those elements should receive their own click/focus behavior.
		const target = e.target as HTMLElement | null;
		if (target?.closest('button, a, input, textarea, select, [role="button"], [contenteditable]')) {
			return;
		}
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		draggingPointerId = e.pointerId;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragDx = 0;
		dragCancelled = false;
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	}

	function onDrawerPointerMove(e: PointerEvent) {
		if (draggingPointerId === null || e.pointerId !== draggingPointerId) return;
		const dx = e.clientX - dragStartX;
		const dy = Math.abs(e.clientY - dragStartY);
		// Only engage horizontal drag if the motion is clearly horizontal.
		if (!dragCancelled && Math.abs(dx) < 8 && dy > 10 && dy > Math.abs(dx) * HORIZ_BIAS) {
			dragCancelled = true;
		}
		if (dragCancelled) return;
		// Clamp to 0..negative (only leftward counts toward closing). Small
		// overshoot to the right is allowed to feel springy.
		dragDx = Math.min(24, dx);
	}

	function endDrawerDrag() {
		if (draggingPointerId === null) return;
		if (!dragCancelled && dragDx <= -CLOSE_THRESHOLD) {
			sidebar.root.closeMobile();
		}
		draggingPointerId = null;
		dragDx = 0;
		dragCancelled = false;
	}

	function onDrawerPointerUp(e: PointerEvent) {
		if (e.pointerId !== draggingPointerId) return;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
		} catch {
			/* no-op */
		}
		endDrawerDrag();
	}

	function onDrawerPointerCancel(e: PointerEvent) {
		if (e.pointerId !== draggingPointerId) return;
		endDrawerDrag();
	}

	// Transform only kicks in while user is actively dragging; otherwise
	// we rely on the default position for a smooth open/close animation.
	const drawerTransform = $derived(
		draggingPointerId !== null ? `translateX(${Math.min(0, dragDx)}px)` : ''
	);
	const drawerTransition = $derived(
		draggingPointerId !== null ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
	);
</script>

<svelte:window onpointermove={handleResizeMove} onpointerup={handleResizeStop} />

{#if sidebar.root.showSidebar}
	{#if sidebar.root.isMobile.current}
		<div
			class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
			onclick={() => sidebar.root.closeMobile()}
			role="button"
			tabindex="0"
			aria-label="Close sidebar"
			onkeydown={(e) => e.key === 'Escape' && sidebar.root.closeMobile()}
			transition:fade={{ duration: 180 }}
		></div>
	{/if}

	<div
		{...rest}
		onpointerdown={sidebar.root.isMobile.current ? onDrawerPointerDown : undefined}
		onpointermove={sidebar.root.isMobile.current ? onDrawerPointerMove : undefined}
		onpointerup={sidebar.root.isMobile.current ? onDrawerPointerUp : undefined}
		onpointercancel={sidebar.root.isMobile.current ? onDrawerPointerCancel : undefined}
		style={sidebar.root.isMobile.current
			? `transform: ${drawerTransform}; transition: ${drawerTransition}; touch-action: pan-y;`
			: ''}
		class={cn(
			'bg-sidebar border-sidebar-border fill-device-height relative col-start-1 w-[--sidebar-width] border-r',
			sidebar.root.isMobile.current &&
				'fixed inset-y-0 left-0 z-50 h-[100dvh] max-w-[88vw] rounded-r-2xl shadow-2xl',
			className
		)}
	>
		{#if !sidebar.root.isMobile.current}
			<div
				class="bg-sidebar/0 hover:bg-sidebar/20 absolute top-0 right-0 z-20 h-full w-2.5 cursor-col-resize touch-none select-none transition-colors"
				onpointerdown={handleResizeStart}
				role="separator"
			>
				<div
					class="bg-sidebar-foreground/40 absolute top-1/2 right-1 h-8 w-0.5 -translate-y-1/2 rounded-full"
				></div>
			</div>
		{:else}
			<!-- Drag-affordance handle on the right edge of the mobile drawer, like
			     iOS sheets. Purely decorative; the whole drawer is draggable. -->
			<div
				class="bg-sidebar-foreground/30 pointer-events-none absolute top-1/2 right-1.5 z-20 h-12 w-1 -translate-y-1/2 rounded-full"
			></div>
		{/if}
		{@render children?.()}
	</div>
{/if}
