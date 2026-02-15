<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import { tv } from 'tailwind-variants';
	import type { Doc, Id } from '$lib/db/types';
	import { CopyButton } from '$lib/components/ui/copy-button';
	import '../../../markdown.css';
	import MarkdownRenderer from './markdown-renderer.svelte';
	import { ImageModal } from '$lib/components/ui/image-modal';
	import { sanitizeHtml } from '$lib/utils/markdown-it';
	import { on } from 'svelte/events';
	import { isHtmlElement } from '$lib/utils/is';
	import { Button } from '$lib/components/ui/button';
	import { fly } from 'svelte/transition';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { ResultAsync } from 'neverthrow';
	import { goto } from '$app/navigation';
	import { callGenerateMessage } from '../../api/generate-message/call';
	import { Branch, BranchAndRegen } from '$lib/components/icons';
	import { settings } from '$lib/state/settings.svelte';
	import ShinyText from '$lib/components/animations/shiny-text.svelte';
	import MessageRating from '$lib/components/ui/message-rating.svelte';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import RefreshCwIcon from '~icons/lucide/refresh-cw';
	import PencilIcon from '~icons/lucide/pencil';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { AnnotationSchema, type Annotation } from '$lib/types';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import GlobeIcon from '~icons/lucide/globe';
	import { Avatar } from 'melt/components';
	import BrainIcon from '~icons/lucide/brain';
	import * as casing from '$lib/utils/casing';
	import { audioPlayer } from '$lib/state/audio-player.svelte';
	import Volume2Icon from '~icons/lucide/volume-2';
	import SquareIcon from '~icons/lucide/square';
	import Loader2Icon from '~icons/lucide/loader-2';
	import StarIcon from '~icons/lucide/star';

	const style = tv({
		base: 'prose rounded-xl p-2 max-w-full',
		variants: {
			role: {
				user: 'bg-secondary/50 border border-secondary/70 px-3 py-2 !text-black/80 dark:!text-secondary-foreground self-end',
				assistant: 'text-foreground',
			},
		},
	});

	type Props = {
		message: Doc<'messages'>;
		childMessageId?: string;
	};

	let { message, childMessageId }: Props = $props();

	const safeContent = $derived.by(() =>
		typeof message.content === 'string' ? message.content : ''
	);
	const safeImages = $derived.by(() =>
		Array.isArray(message.images)
			? message.images.filter(
					(image) => image && typeof image.url === 'string' && typeof image.storage_id === 'string'
				)
			: []
	);
	const displayContent = $derived.by(() => {
		if (safeImages.length === 0) return safeContent;
		const stripped = safeContent.replace(/!\[[^\]]*]\([^)]*\)/g, '').trim();
		return stripped.length > 0 ? stripped : 'Generated Image';
	});

	let imageModal = $state<{ open: boolean; imageUrl: string; fileName: string }>({
		open: false,
		imageUrl: '',
		fileName: '',
	});

	function openImageModal(imageUrl: string, fileName: string) {
		imageModal = {
			open: true,
			imageUrl,
			fileName,
		};
	}

	async function createBranchedConversation() {
		// Log regenerate interaction
		if (message.role === 'user') {
			await logInteraction('regenerate');
		}

		const res = await ResultAsync.fromPromise(
			mutate<{ conversationId: string }>(api.conversations.createBranched.url, {
				action: 'branch',
				conversationId: message.conversationId,
				fromMessageId: message.id,
			}),
			(e) => e
		);

		if (res.isErr()) {
			console.error(res.error);
			return;
		}

		const cid = res.value.conversationId;

		if (message.role === 'user' && settings.modelId) {
			const generateRes = await callGenerateMessage({
				session_token: session.current?.session.token ?? '',
				conversation_id: cid,
				model_id: settings.modelId,
				images: message.images ?? undefined,
				web_search_enabled: message.webSearchEnabled ?? undefined,
			});

			if (generateRes.isErr()) {
				// TODO: add error toast
				return;
			}
		}

		await goto(`/chat/${cid}`);
	}

	const annotations = $derived.by(() => {
		if (!message.annotations || message.annotations.length === 0) return null;

		const annotations: Annotation[] = [];

		for (const annotation of message.annotations) {
			const parsed = AnnotationSchema.safeParse(annotation);

			if (!parsed.success) continue;

			annotations.push(parsed.data);
		}

		return annotations;
	});

	// Detect Video URL in content
	const videoUrl = $derived.by(() => {
		if (!safeContent) return null;
		const match = safeContent.match(/\[Video Result\]\((.*?)\)/);
		return match ? match[1] : null;
	});

	let showReasoning = $state(false);

	async function handleRating(data: {
		thumbs?: 'up' | 'down';
		rating?: number;
		categories?: string[];
		feedback?: string;
	}) {
		if (!session.current?.user?.id) {
			console.warn('[message] Cannot submit rating: user not logged in');
			return;
		}

		try {
			const response = await fetch('/api/db/message-ratings', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					messageId: message.id,
					...data,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				console.error('[message] Failed to submit rating:', errorData);
				// TODO: Show toast notification to user
			}
		} catch (error) {
			console.error('[message] Error submitting rating:', error);
			// TODO: Show toast notification to user
		}
	}

	async function logInteraction(action: 'copy' | 'regenerate' | 'share') {
		if (!session.current?.user?.id) {
			// Silently skip logging if user not logged in
			return;
		}

		try {
			const response = await fetch('/api/db/message-interactions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					messageId: message.id,
					action,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				console.error(`[message] Failed to log ${action} interaction:`, errorData);
			}
		} catch (error) {
			console.error(`[message] Error logging ${action} interaction:`, error);
			// Silently fail - interaction logging is non-critical
		}
	}

	let isEditing = $state(false);
	let editedContent = $state('');
	let isStarred = $state<boolean>(false);

	$effect(() => {
		isStarred = message.starred ?? false;
	});

	function startEditing() {
		editedContent = safeContent;
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		editedContent = '';
	}

	async function toggleStarred() {
		if (!session.current?.session.token) return;
		if (message.role !== 'assistant') return;

		const previous = isStarred;
		isStarred = !isStarred;

		try {
			const res = await fetch(api.messages.setStarred.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'setStarred',
					messageId: message.id,
					starred: isStarred,
				}),
			});

			if (!res.ok) {
				console.error('Failed to update starred state');
				isStarred = previous;
				return;
			}

			invalidateQueryPattern(api.messages.getAllFromConversation.url);
		} catch (e) {
			console.error('Error updating starred state:', e);
			isStarred = previous;
		}
	}

	async function saveMessage() {
		if (editedContent === safeContent) {
			cancelEditing();
			return;
		}

		try {
			const res = await fetch('/api/db/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'updateContent',
					messageId: message.id,
					content: editedContent,
				}),
			});

			if (res.ok) {
				// Invalidate queries to refresh UI
				invalidateQueryPattern(api.messages.getAllFromConversation.url);
				isEditing = false;
			} else {
				console.error('Failed to update message');
				// TODO: Show toast
			}
		} catch (e) {
			console.error('Error updating message:', e);
		}
	}
	async function regenerateInPlace() {
		if (!session.current?.session.token) return;

		// Log regenerate interaction
		await logInteraction('regenerate');

		let messageIdToDelete = message.role === 'assistant' ? message.id : childMessageId;

		if (messageIdToDelete) {
			try {
				const res = await fetch(api.messages.delete.url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'delete',
						messageId: messageIdToDelete,
					}),
				});

				if (!res.ok) {
					console.error('Failed to delete message');
					return;
				}

				invalidateQueryPattern(api.messages.getAllFromConversation.url);
			} catch (e) {
				console.error('Error deleting message:', e);
				return;
			}
		}

		if (settings.modelId) {
			const generateRes = await callGenerateMessage({
				session_token: session.current.session.token,
				conversation_id: message.conversationId,
				model_id: settings.modelId,
				images: message.images ?? undefined,
				web_search_enabled: message.webSearchEnabled ?? undefined,
			});

			if (generateRes.isErr()) {
				console.error('Failed to regenerate:', generateRes.error);
			} else {
				invalidateQueryPattern(api.conversations.getById.url);
				invalidateQueryPattern(api.messages.getAllFromConversation.url);
			}
		}
	}
</script>

{#if message.role !== 'system' && !(message.role === 'assistant' && safeContent.length === 0 && message.reasoning?.length === 0 && !message.error)}
	<div
		in:fly={{ y: 20, duration: 300, delay: message.role === 'assistant' ? 100 : 0 }}
		class={cn('group flex flex-col gap-1', { 'max-w-[80%] self-end ': message.role === 'user' })}
		{@attach (node) => {
			return on(node, 'click', (e) => {
				const el = e.target as HTMLElement;
				const closestCopyButton = el.closest('.copy[data-code]');
				if (!isHtmlElement(closestCopyButton)) return;

				const code = closestCopyButton.dataset.code;
				if (!code) return;

				navigator.clipboard.writeText(code);
				closestCopyButton.classList.add('copied');
				setTimeout(() => closestCopyButton.classList.remove('copied'), 3000);
			});
		}}
	>
		{#if videoUrl}
			<div class="mb-4 overflow-hidden rounded-lg bg-black/10">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video src={videoUrl} controls class="h-auto w-full max-w-full rounded-lg bg-black"></video>
			</div>
		{/if}

		{#if safeImages.length > 0}
			<div class="mb-2 flex flex-wrap gap-2">
				{#each safeImages as image (image.storage_id)}
					<button
						type="button"
						onclick={() => openImageModal(image.url, image.fileName || 'image')}
						class="rounded-lg"
					>
						<img
							src={image.url}
							alt={image.fileName || 'Uploaded'}
							class="max-w-[160px] rounded-lg transition-opacity hover:opacity-80 md:max-w-xs"
						/>
					</button>
				{/each}
			</div>
		{/if}
		{#if message.reasoning}
			<div class="mb-4">
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground flex items-center gap-2 py-2 text-sm transition-colors"
					aria-label="Toggle reasoning"
					onclick={() => (showReasoning = !showReasoning)}
				>
					<div
						class="from-primary/20 flex size-6 items-center justify-center rounded-md bg-gradient-to-br to-fuchsia-500/20"
					>
						<BrainIcon class="text-primary size-3.5" />
					</div>
					<ChevronRightIcon
						class={cn('size-4 transition-transform duration-200', { 'rotate-90': showReasoning })}
					/>
					{#if safeContent.length === 0}
						<ShinyText class="font-medium">Thinking...</ShinyText>
					{:else}
						<span class="font-medium">Reasoning</span>
					{/if}
				</button>
				<div
					class={cn(
						'grid transition-all duration-300 ease-in-out',
						showReasoning ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
					)}
				>
					<div class="overflow-hidden">
						<div
							class="border-primary/20 from-primary/5 relative mt-2 overflow-hidden rounded-lg border bg-gradient-to-r to-transparent"
						>
							<div
								class="from-primary to-primary/50 absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b via-fuchsia-500"
							></div>
							<div class="reasoning-content max-h-96 overflow-y-auto py-3 pr-3 pl-4">
								<div
									class="prose prose-sm dark:prose-invert prose-p:text-muted-foreground prose-headings:text-muted-foreground prose-strong:text-muted-foreground prose-li:text-muted-foreground max-w-none text-sm leading-relaxed"
								>
									<MarkdownRenderer content={message.reasoning} />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
		<div class={style({ role: message.role as 'user' | 'assistant' })}>
			{#if isEditing}
				<div class="flex min-w-[300px] flex-col gap-2">
					<textarea
						bind:value={editedContent}
						class="min-h-[100px] w-full resize-y rounded-md bg-transparent p-1 text-inherit outline-none focus:ring-0"
						onkeydown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								saveMessage();
							} else if (e.key === 'Escape') {
								cancelEditing();
							}
						}}
					></textarea>
					<div class="mt-1 flex justify-end gap-2">
						<Button size="sm" variant="ghost" onclick={cancelEditing} class="h-7 text-xs"
							>Cancel</Button
						>
						<Button size="sm" onclick={saveMessage} class="h-7 text-xs">Save</Button>
					</div>
				</div>
			{:else if message.error}
				<div class="text-destructive">
					<pre class="!bg-sidebar"><code>{message.error}</code></pre>
				</div>
			{:else if message.contentHtml}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html sanitizeHtml(message.contentHtml)}
			{:else}
				<svelte:boundary>
					<MarkdownRenderer content={displayContent} />

					{#snippet failed(error)}
						<div class="text-destructive">
							<span>Error rendering markdown:</span>
							<pre class="!bg-sidebar"><code
									>{error instanceof Error ? error.message : String(error)}</code
								></pre>
						</div>
					{/snippet}
				</svelte:boundary>
			{/if}
		</div>
		{#if annotations}
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground pl-2 text-xs">
					{annotations.length}
					{annotations.length === 1 ? 'Citation' : 'Citations'}
				</span>
				<div class="flex items-center">
					{#each annotations as annotation}
						{#if annotation.type === 'url_citation'}
							{@const url = new URL(annotation.url_citation.url)}
							<a
								href={annotation.url_citation.url}
								target="_blank"
								class="border-border bg-background bg-noise -m-1 flex place-items-center justify-center rounded-full border p-0.5 transition-transform hover:scale-110"
							>
								{@render siteIcon({ url })}
							</a>
						{/if}
					{/each}
				</div>
			</div>
			<div class="scrollbar-hide flex place-items-center gap-2 overflow-x-auto p-2">
				{#each annotations as annotation}
					{#if annotation.type === 'url_citation'}
						{@const url = new URL(annotation.url_citation.url)}
						<div
							class="border-border hover:border-primary/50 text-muted-foreground group relative flex h-32 min-w-60 flex-col justify-between rounded-lg border p-4 transition-colors"
						>
							<div>
								<a
									href={annotation.url_citation.url}
									target="_blank"
									class="group-hover:text-foreground block max-w-full truncate font-medium transition-colors"
								>
									<span class="absolute inset-0"></span>
									{annotation.url_citation.title}
								</a>
								<p class="truncate text-sm">
									{annotation.url_citation.content}
								</p>
							</div>
							<span class="flex items-center gap-2 text-xs">
								{@render siteIcon({ url })}
								{url.hostname}
							</span>

							<ExternalLinkIcon class="text-primary absolute top-2 right-2 size-3" />
						</div>
					{/if}
				{/each}
			</div>
		{/if}
		<div
			class={cn(
				'flex flex-wrap place-items-center gap-1 transition-all duration-300 ease-out group-hover:opacity-100 md:gap-2 md:opacity-0',
				{
					'justify-end': message.role === 'user',
				}
			)}
		>
			<!-- Action buttons - always visible on mobile -->
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Button
						size="icon"
						variant="ghost"
						class={cn('group order-2 size-7', { 'order-1': message.role === 'user' })}
						onClickPromise={createBranchedConversation}
						{...tooltip.trigger}
					>
						{#if message.role === 'user'}
							<BranchAndRegen class="group-data-[loading=true]:opacity-0" />
						{:else}
							<Branch class="group-data-[loading=true]:opacity-0" />
						{/if}
					</Button>
				{/snippet}
				{message.role === 'user' ? 'Branch and regenerate message' : 'Branch off this message'}
			</Tooltip>

			{#if message.role === 'assistant' && safeContent.length > 0}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<Button
							size="icon"
							variant="ghost"
							class={cn('group order-0 size-7')}
							onclick={() => {
								if (audioPlayer.isPlaying && audioPlayer.currentMessageId === message.id) {
									audioPlayer.stop();
								} else {
									audioPlayer.play(displayContent, message.id);
								}
							}}
							{...tooltip.trigger}
						>
							{#if audioPlayer.isLoading && audioPlayer.currentMessageId === message.id}
								<Loader2Icon class="size-4 animate-spin" />
							{:else if audioPlayer.isPlaying && audioPlayer.currentMessageId === message.id}
								<SquareIcon class="size-3 fill-current" />
							{:else}
								<Volume2Icon class="size-4" />
							{/if}
						</Button>
					{/snippet}
					{audioPlayer.isPlaying && audioPlayer.currentMessageId === message.id
						? 'Stop reading'
						: 'Read aloud'}
				</Tooltip>
			{/if}
			{#if message.role === 'assistant' && safeContent.length > 0 && !message.error}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<Button
							size="icon"
							variant="ghost"
							class="order-1 size-7"
							onclick={toggleStarred}
							{...tooltip.trigger}
						>
							<StarIcon
								class={cn('size-4', {
									'fill-yellow-400 text-yellow-400': isStarred,
									'text-muted-foreground/60': !isStarred,
								})}
							/>
						</Button>
					{/snippet}
					{isStarred ? 'Unstar message' : 'Star message'}
				</Tooltip>
			{/if}

			{#if safeContent.length > 0}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<CopyButton
							class={cn('order-1 size-7', { 'order-2': message.role === 'user' })}
							text={safeContent}
							onclick={() => logInteraction('copy')}
							{...tooltip.trigger}
						/>
					{/snippet}
					Copy
				</Tooltip>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class={cn(
						'hover:bg-accent order-3 flex size-7 items-center justify-center rounded-md transition-colors',
						{ 'order-3': message.role === 'user' }
					)}
				>
					<ChevronDownIcon class="size-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-40">
					<DropdownMenu.Item onclick={startEditing} class="cursor-pointer gap-2">
						<PencilIcon class="size-4" />
						<span>Edit</span>
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={regenerateInPlace} class="cursor-pointer gap-2">
						<RefreshCwIcon class="size-4" />
						<span>Regenerate</span>
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			{#if message.role === 'assistant'}
				<!-- Desktop: Show all metadata inline -->
				<div class="hidden items-center gap-2 md:flex">
					{#if message.modelId}
						{@const modelName = message.modelId.split('/').pop() || message.modelId}
						<span class="text-muted-foreground text-xs">{modelName}</span>
					{/if}
					{#if message.reasoningEffort}
						<span class="text-muted-foreground text-xs">
							<BrainIcon class="inline-block size-4 shrink-0 text-green-500" />
							{casing.camelToPascal(message.reasoningEffort)}
						</span>
					{/if}
					{#if message.webSearchEnabled}
						<Tooltip>
							{#snippet trigger(tooltip)}
								<span
									class="text-muted-foreground flex items-center gap-1 text-xs"
									{...tooltip.trigger}
								>
									<GlobeIcon class="text-primary inline-block size-4 shrink-0" />
									{#if annotations && annotations.length > 0}
										<span class="text-primary">×{annotations.length}</span>
									{/if}
								</span>
							{/snippet}
							{#if annotations && annotations.length > 0}
								Web search: {annotations.length} result{annotations.length === 1 ? '' : 's'} found
							{:else}
								Web search enabled
							{/if}
						</Tooltip>
					{/if}
					{#if message.costUsd != null}
						<span class="text-muted-foreground text-xs">
							${message.costUsd.toFixed(6)}
						</span>
					{/if}
					{#if message.tokenCount != null}
						<span class="text-muted-foreground text-xs">
							{message.tokenCount.toLocaleString()} tokens
						</span>
					{/if}
					{#if message.tokenCount != null && message.responseTimeMs != null && message.responseTimeMs > 0}
						{@const tps = message.tokenCount / (message.responseTimeMs / 1000)}
						<span class="text-muted-foreground text-xs">
							{tps.toFixed(1)} t/s
						</span>
					{/if}
					{#if message.timeToFirstTokenMs != null}
						{@const ttftMs = message.timeToFirstTokenMs}
						{@const showTtftSeconds = ttftMs >= 1000}
						<span class="text-muted-foreground text-xs">
							TTFT {showTtftSeconds ? `${(ttftMs / 1000).toFixed(2)}s` : `${ttftMs}ms`}
						</span>
					{/if}
				</div>
				<!-- Mobile: Compact metadata in a single info chip -->
				<div class="flex items-center gap-1.5 md:hidden">
					{#if message.modelId}
						{@const modelName = message.modelId.split('/').pop() || message.modelId}
						<span class="text-muted-foreground max-w-[100px] truncate text-xs">{modelName}</span>
					{/if}
					{#if message.costUsd != null}
						<span class="text-muted-foreground text-xs">${message.costUsd.toFixed(4)}</span>
					{/if}
				</div>
			{/if}
		</div>
		{#if message.role === 'assistant' && safeContent.length > 0 && !message.error}
			<div class="mt-2">
				<MessageRating messageId={message.id} onRate={handleRating} />
			</div>
		{/if}
	</div>

	{#if safeImages.length > 0}
		<ImageModal
			bind:open={imageModal.open}
			imageUrl={imageModal.imageUrl}
			fileName={imageModal.fileName}
		/>
	{/if}
{/if}

{#snippet siteIcon({ url }: { url: URL })}
	<Avatar src={`https://www.google.com/s2/favicons?domain=${url.hostname}&sz=16`}>
		{#snippet children(avatar)}
			<img {...avatar.image} alt={`${url.hostname} site icon`} />
			<span {...avatar.fallback}>
				<GlobeIcon class="inline-block size-4 shrink-0" />
			</span>
		{/snippet}
	</Avatar>
{/snippet}
