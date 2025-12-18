<script lang="ts">
	import { cn } from '$lib/utils/utils.js';
	import { Popover as PopoverPrimitive } from 'bits-ui';
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PopoverPrimitive.TriggerProps = $props();
</script>

<PopoverPrimitive.Trigger
	bind:ref
	data-slot="popover-trigger"
	class={cn('', className)}
	type="button"
	{...restProps}
>
	{@render children?.()}
</PopoverPrimitive.Trigger>
