<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebar } from './sidebar.svelte.js';
	import { shortcut, getKeybindOptions } from '$lib/actions/shortcut.svelte.js';

	let {
		open = $bindable(false),
		children,
		...rest
	}: HTMLAttributes<HTMLDivElement> & { open?: boolean } = $props();

	const sidebar = useSidebar();

	$effect(() => {
		open = sidebar.showSidebar;
	});

	// -----------------------------------------------------------------------------
	// Edge-swipe-to-open
	//
	// Previously this was a window-level touchmove listener that flipped
	// `openMobile = true` whenever a touch drifted more than 60px to the right
	// from near the left edge. Two problems with that:
	//
	//   1. touchmove never calls `preventDefault` on a passive window listener,
	//      so the browser continued the scroll / tap that the user initiated —
	//      meaning the drawer would open AND the tap would register on whatever
	//      UI happened to be under the finger.
	//   2. Any horizontal drift during a vertical scroll near the left edge
	//      would accidentally open the drawer.
	//
	// The new approach uses an explicit edge "grip": an absolute-positioned strip
	// along the left edge with `touch-action: none`, so the browser never
	// interprets touches there as scrolls. We use pointer events + pointer
	// capture, which lets us cleanly swallow the gesture (no stray click fires
	// after the pointerup because we set `pointer-events: none` on the rest of
	// the app during the gesture via a root-level class).
	// -----------------------------------------------------------------------------

	const EDGE_WIDTH = 16; // visible/tappable strip width in px
	const OPEN_THRESHOLD_X = 48; // how far right the finger must travel
	const CANCEL_ANGLE = 1.2; // dy/dx ratio above which we treat it as a scroll

	let gripEl: HTMLDivElement | undefined = $state();
	let gesturing = $state(false);
	let gestureStartX = 0;
	let gestureStartY = 0;
	let gestureDx = $state(0);
	let gestureCancelled = false;
	let activePointerId: number | null = null;

	function onPointerDown(e: PointerEvent) {
		if (!sidebar.isMobile.current || sidebar.openMobile) return;
		// Only primary (first) touches / left mouse button
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		gesturing = true;
		gestureCancelled = false;
		gestureStartX = e.clientX;
		gestureStartY = e.clientY;
		gestureDx = 0;
		activePointerId = e.pointerId;
		gripEl?.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!gesturing || e.pointerId !== activePointerId) return;
		const dx = e.clientX - gestureStartX;
		const dy = Math.abs(e.clientY - gestureStartY);
		// If motion is predominantly vertical, give up on the gesture and
		// let the user scroll normally on the next frame.
		if (!gestureCancelled && dx < 10 && dy > 10 && dy > dx * CANCEL_ANGLE) {
			gestureCancelled = true;
		}
		if (gestureCancelled) return;
		gestureDx = Math.max(0, dx);
		// Prevent any synthesized scroll while we own the gesture.
		e.preventDefault();
	}

	function endGesture(commit: boolean) {
		if (!gesturing) return;
		if (commit && !gestureCancelled) {
			// Treat a short, non-scroll touch on the grip as an intentional tap —
			// open the sidebar. This matches the `Open sidebar` aria-label.
			const isTap = gestureDx < 4;
			if (isTap || gestureDx >= OPEN_THRESHOLD_X) {
				sidebar.openMobile = true;
			}
		}
		gesturing = false;
		gestureDx = 0;
		activePointerId = null;
	}

	function onPointerUp(e: PointerEvent) {
		if (e.pointerId !== activePointerId) return;
		try {
			gripEl?.releasePointerCapture(e.pointerId);
		} catch {
			/* no-op */
		}
		endGesture(true);
	}

	function onPointerCancel(e: PointerEvent) {
		if (e.pointerId !== activePointerId) return;
		endGesture(false);
	}

	// Peek width: give a subtle visual hint that a drawer is being dragged.
	// Capped so it never looks like the drawer is half-open before they commit.
	const peekWidth = $derived(Math.min(gestureDx, 32));
</script>

<svelte:window use:shortcut={getKeybindOptions('toggleSidebar', sidebar.toggle)} />

<div
	{...rest}
	class={cn(
		'[--sidebar-width:0px] md:grid md:grid-cols-[var(--sidebar-width)_1fr]',
		rest.class
	)}
	style={`--sidebar-width: ${sidebar.showSidebar ? `${sidebar.effectiveWidth}px` : '0px'};`}
>
	{@render children?.()}

	{#if sidebar.isMobile.current && !sidebar.openMobile}
		<!-- Edge grip: absolute-positioned strip on the left edge. touch-action:none
		     means the browser never interprets touches here as scrolls, so vertical
		     scrolling of the main content starts outside this 16px band. -->
		<button
			type="button"
			aria-label="Open sidebar"
			bind:this={gripEl}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerCancel}
			class="fixed top-0 bottom-0 left-0 z-30 md:hidden"
			style={`width: ${EDGE_WIDTH}px; touch-action: none; -webkit-tap-highlight-color: transparent; background: transparent; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);`}
		></button>

		{#if gesturing && peekWidth > 4}
			<!-- Peek bar: follows the finger for the first ~32px of drag, gives
			     the user feedback that the gesture is doing something. -->
			<div
				class="bg-sidebar border-sidebar-border pointer-events-none fixed top-0 bottom-0 left-0 z-30 border-r shadow-xl md:hidden"
				style={`width: ${peekWidth}px;`}
			></div>
		{/if}
	{/if}
</div>
