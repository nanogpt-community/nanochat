<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { toSafeResourceUrl } from '$lib/utils/html-sanitizer';
	import XIcon from '~icons/lucide/x';
	import DownloadIcon from '~icons/lucide/download';
	import ExternalLinkIcon from '~icons/lucide/external-link';

	type Props = {
		open?: boolean;
		documentUrl: string;
		fileName?: string;
		fileType?: 'pdf' | 'markdown' | 'text' | 'epub';
		content?: string;
	};

	let {
		open = $bindable(false),
		documentUrl,
		fileName = '',
		fileType = 'pdf',
		content = '',
	}: Props = $props();

	const dispatch = createEventDispatcher();
	const safeDocumentUrl = $derived(
		documentUrl.startsWith('/api/storage/') ? toSafeResourceUrl(documentUrl) : null
	);

	function handleDownload() {
		if (!safeDocumentUrl) return;
		const link = document.createElement('a');
		link.href = safeDocumentUrl;
		link.download = fileName;
		link.click();
	}

	function handleOpenInNewTab() {
		if (!safeDocumentUrl) return;
		window.open(safeDocumentUrl, '_blank', 'noopener,noreferrer');
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
		style="padding: max(0.5rem, env(safe-area-inset-top)) max(0.5rem, env(safe-area-inset-right)) max(0.5rem, env(safe-area-inset-bottom)) max(0.5rem, env(safe-area-inset-left));"
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
			class="bg-background text-foreground flex max-h-[100dvh] w-full max-w-4xl flex-col rounded-2xl border shadow-2xl sm:max-h-[90dvh]"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center justify-between gap-2 border-b p-3 sm:p-4">
				<h2 id="document-title" class="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
					{fileName}
				</h2>
				<div class="flex shrink-0 items-center gap-1 sm:gap-2">
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
			<div class="scroll-momentum flex-1 overflow-auto overscroll-contain p-3 sm:p-4">
				{#if fileType === 'pdf' && safeDocumentUrl}
					<iframe
						src={safeDocumentUrl}
						class="h-[60dvh] w-full rounded-lg border sm:h-[70vh]"
						title={fileName}
					></iframe>
				{:else if fileType === 'markdown' || fileType === 'text'}
					<div class="bg-muted rounded-lg border p-3 sm:p-4">
						<pre class="font-mono text-sm break-words whitespace-pre-wrap">{content}</pre>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
