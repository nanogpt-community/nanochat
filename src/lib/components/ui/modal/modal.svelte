<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import { clickOutside } from '$lib/attachments/click-outside.svelte.js';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		open: boolean;
		/** Extra classes for the box, e.g. a wider max-width. */
		class?: string;
	}

	let { children, open = $bindable(false), class: className }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (open) {
			dialog?.showModal();
		} else {
			dialog?.close();
		}
	});
</script>

<dialog class="modal" bind:this={dialog} onclose={() => (open = false)}>
	<div
		class={cn('modal-box', className)}
		{@attach clickOutside(() => {
			if (open) open = false;
		})}
	>
		{@render children()}
	</div>
</dialog>
