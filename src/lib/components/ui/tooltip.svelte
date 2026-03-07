<script lang="ts">
	import { type ComponentProps, type Extracted } from 'melt';
	import { Tooltip, type TooltipProps } from 'melt/builders';
	import type { Snippet } from 'svelte';

	type FloatingConfig = NonNullable<Extracted<TooltipProps['floatingConfig']>>;

	interface Props extends Omit<
		ComponentProps<TooltipProps>,
		'floatingConfig' | 'open' | 'onOpenChange'
	> {
		children: Snippet;
		trigger: Snippet<[Tooltip]>;
		placement?: NonNullable<FloatingConfig['computePosition']>['placement'];
		openDelay?: ComponentProps<TooltipProps>['openDelay'];
		disabled?: boolean;
	}
	const {
		children,
		trigger,
		placement = 'bottom',
		openDelay = 250,
		disabled,
		closeDelay,
		closeOnPointerDown,
		forceVisible = true,
		disableHoverableContent = true,
	}: Props = $props();

	let open = $state(false);
	const tooltip = new Tooltip({
		floatingConfig: () => ({
			computePosition: { placement },
			flip: {
				fallbackPlacements: ['bottom'],
				padding: 10,
			},
		}),
		closeDelay: () => closeDelay,
		closeOnPointerDown: () => closeOnPointerDown,
		forceVisible: () => forceVisible,
		open: () => open,
		onOpenChange(v) {
			if (disabled) open = false;
			else open = v;
		},
		openDelay: () => openDelay,
		disableHoverableContent: () => disableHoverableContent,
	});
</script>

<svelte:window onblur={() => (open = false)} />

{@render trigger(tooltip)}

<div {...tooltip.content} class="bg-popover border-border rounded border p-0 shadow-xl">
	<p class="text-popover-foreground px-2 py-1 text-xs">{@render children()}</p>
</div>

<style>
	[data-melt-tooltip-content] {
		position: absolute;
		pointer-events: none;
		opacity: 0;

		transform: scale(0.9);

		transition: 0.1s;
		transition-property: opacity, transform;
	}

	[data-melt-tooltip-content][data-open] {
		pointer-events: auto;
		opacity: 1;

		transform: scale(1);
	}
</style>
