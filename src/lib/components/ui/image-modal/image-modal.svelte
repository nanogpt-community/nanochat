<script lang="ts">
	import { Modal } from '$lib/components/ui/modal';
	import { Button } from '$lib/components/ui/button';
	import { toSafeResourceUrl } from '$lib/utils/html-sanitizer';
	import DownloadIcon from '~icons/lucide/download';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import XIcon from '~icons/lucide/x';
	import Tooltip from '../tooltip.svelte';

	type Props = {
		open?: boolean;
		imageUrl: string;
		fileName?: string;
	};

	let { open = $bindable(false), imageUrl, fileName = 'image' }: Props = $props();
	const safeImageUrl = $derived(toSafeResourceUrl(imageUrl));

	function openInNewTab() {
		if (!safeImageUrl) return;
		window.open(safeImageUrl, '_blank', 'noopener,noreferrer');
	}
</script>

<Modal bind:open>
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{fileName}</h2>
		<div class="flex items-center gap-2">
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Button
						size="iconSm"
						variant="outline"
						download={fileName}
						href={safeImageUrl ?? undefined}
						{...tooltip.trigger}
					>
						<DownloadIcon class="size-4" />
					</Button>
				{/snippet}
				Download image
			</Tooltip>
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Button size="iconSm" variant="outline" onclick={openInNewTab} {...tooltip.trigger}>
						<ExternalLinkIcon class="size-4" />
					</Button>
				{/snippet}
				Open in new tab
			</Tooltip>
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Button
						size="iconSm"
						variant="outline"
						onclick={() => (open = false)}
						{...tooltip.trigger}
					>
						<XIcon class="size-4" />
					</Button>
				{/snippet}
				Close
			</Tooltip>
		</div>
	</div>

	<div
		class="mt-2 flex max-h-[75dvh] items-center justify-center overflow-auto sm:max-h-[60vh]"
		style="touch-action: pinch-zoom;"
	>
		{#if safeImageUrl}
			<img
				src={safeImageUrl}
				alt={fileName}
				class="max-w-full rounded-lg object-contain"
				draggable="false"
			/>
		{/if}
	</div>
</Modal>
