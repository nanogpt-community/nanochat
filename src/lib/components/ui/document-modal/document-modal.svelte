<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import XIcon from '~icons/lucide/x';
	import DownloadIcon from '~icons/lucide/download';
	import ExternalLinkIcon from '~icons/lucide/external-link';

	export let open = false;
	export let documentUrl = '';
	export let fileName = '';
	export let fileType: 'pdf' | 'markdown' | 'text' | 'epub' = 'pdf';
	export let content = '';

	const dispatch = createEventDispatcher();

	function handleDownload() {
		const link = document.createElement('a');
		link.href = documentUrl;
		link.download = fileName;
		link.click();
	}

	function handleOpenInNewTab() {
		window.open(documentUrl, '_blank');
	}

	function handleClose() {
		open = false;
		dispatch('close');
	}

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={handleClose}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') handleClose();
		}}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-labelledby="document-title"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="bg-background text-foreground mx-4 flex max-h-[90vh] max-w-4xl flex-col rounded-2xl border shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b p-4">
				<h2 id="document-title" class="truncate text-lg font-semibold">{fileName}</h2>
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="icon" onclick={handleDownload} title="Download">
						<DownloadIcon class="size-4" />
					</Button>
					<Button variant="ghost" size="icon" onclick={handleOpenInNewTab} title="Open in new tab">
						<ExternalLinkIcon class="size-4" />
					</Button>
					<Button variant="ghost" size="icon" onclick={handleClose} title="Close">
						<XIcon class="size-4" />
					</Button>
				</div>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-auto p-4">
				{#if fileType === 'pdf'}
					<iframe src={documentUrl} class="h-[70vh] w-full rounded-lg border" title={fileName}
					></iframe>
				{:else if fileType === 'markdown' || fileType === 'text'}
					<div class="bg-muted rounded-lg border p-4">
						<pre class="font-mono text-sm break-words whitespace-pre-wrap">{content}</pre>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
