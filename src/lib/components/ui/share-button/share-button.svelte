<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import type { Id } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { UseClipboard } from '$lib/hooks/use-clipboard.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Popover } from 'melt/builders';
	import { ResultAsync } from 'neverthrow';
	import { scale } from 'svelte/transition';
	import CheckIcon from '~icons/lucide/check';
	import CopyIcon from '~icons/lucide/copy';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import ShareIcon from '~icons/lucide/share';
	import XIcon from '~icons/lucide/x';
	import BookmarkIcon from '~icons/lucide/bookmark';

	const clipboard = new UseClipboard();

	import type { Conversation, UserSettings } from '$lib/api';

	let { conversationId } = $props<{
		conversationId: string;
	}>();

	const conversationQuery = useCachedQuery<Conversation>(api.conversations.getById, () => ({
		id: conversationId,
	}));

	const settingsQuery = useCachedQuery<UserSettings>(api.user_settings.get, {});

	let isPublic = $derived(Boolean(conversationQuery.data?.public));
	let isToggling = $state(false);
	let open = $state(false);
	let karakeepSaving = $state(false);
	let karakeepStatus = $state<'idle' | 'success' | 'error'>('idle');
	let karakeepMessage = $state('');

	const hasKarakeepConfig = $derived(
		Boolean(settingsQuery.data?.karakeepUrl && settingsQuery.data?.hasKarakeepApiKey)
	);

	const popover = new Popover({
		open: () => open,
		onOpenChange: (v) => {
			open = v;
		},
		floatingConfig: {
			computePosition: { placement: 'bottom-end' },
		},
	});

	const shareUrl = $derived.by(() => {
		if (typeof window !== 'undefined') {
			return `${window.location.origin}/share/${conversationId}`;
		}
		return '';
	});

	async function toggleSharing(newValue: boolean) {
		if (!session.current?.session.token) return;

		const prev = isPublic;
		isPublic = newValue;

		isToggling = true;
		const result = await ResultAsync.fromPromise(
			mutate(api.conversations.setPublic.url, {
				action: 'setPublic',
				conversationId,
				public: newValue,
			}),
			(e) => e
		);

		if (result.isErr()) {
			// Revert the change if API call failed
			isPublic = prev;
			console.error('Error toggling sharing:', result.error);
		}

		isToggling = false;
	}

	function copyShareUrl() {
		clipboard.copy(shareUrl);
	}

	async function saveToKarakeep() {
		if (!session.current?.session.token) return;

		karakeepSaving = true;
		karakeepStatus = 'idle';
		karakeepMessage = '';

		const result = await ResultAsync.fromPromise(
			fetch('/api/karakeep/save-chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ conversationId }),
			}),
			(e) => e
		);

		karakeepSaving = false;

		if (result.isErr() || !result.value.ok) {
			karakeepStatus = 'error';
			const errorText = result.isErr()
				? (result.error as Error).message
				: await result.value.text();
			karakeepMessage = `Failed to save: ${errorText}`;
		} else {
			karakeepStatus = 'success';
			karakeepMessage = 'Chat saved to Karakeep successfully!';
			setTimeout(() => {
				karakeepStatus = 'idle';
				karakeepMessage = '';
			}, 3000);
		}
	}
</script>

<Tooltip>
	{#snippet trigger(tooltip)}
		<div {...tooltip.trigger}>
			<Button {...popover.trigger} variant="ghost" size="icon" class="size-8">
				<ShareIcon class="size-4" />
			</Button>
		</div>
	{/snippet}
	Share
</Tooltip>

<div
	{...popover.content}
	class="bg-popover border-border z-50 w-80 rounded-lg border p-4 shadow-lg"
>
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-medium">Share conversation</h3>
			<Button onclick={() => (open = false)} variant="ghost" size="icon" class="size-6">
				<XIcon class="size-4" />
			</Button>
		</div>

		<div class="flex items-center justify-between">
			<div class="space-y-1">
				<p class="text-sm font-medium">Public sharing</p>
				<p class="text-muted-foreground text-xs">Anyone with the link can view this conversation</p>
			</div>
			<Switch bind:value={() => isPublic, (v) => toggleSharing(v)} disabled={isToggling} />
		</div>

		{#if isPublic}
			<div class="space-y-2">
				<p class="text-sm font-medium">Share link</p>
				<div class="border-input bg-background flex items-center rounded-xl border px-3 py-2">
					<span class="text-muted-foreground flex-1 truncate text-sm">{shareUrl}</span>
					<Button onclick={copyShareUrl} variant="ghost" size="icon" class="ml-2 size-6 shrink-0">
						{#if clipboard.status === 'success'}
							<div in:scale={{ duration: 200, start: 0.8 }}>
								<CheckIcon class="size-4" />
							</div>
						{:else}
							<CopyIcon class="size-4" />
						{/if}
					</Button>
				</div>
				<a
					href={shareUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
				>
					Open in new tab <ExternalLinkIcon class="size-3" />
				</a>
			</div>
		{:else}
			<p class="text-muted-foreground text-xs">
				Enable public sharing to generate a shareable link
			</p>
		{/if}

		{#if hasKarakeepConfig}
			<div class="border-border border-t pt-4">
				<p class="mb-2 text-sm font-medium">Save to Karakeep</p>
				<p class="text-muted-foreground mb-3 text-xs">
					Save this conversation as a markdown bookmark in Karakeep
				</p>
				<Button onclick={saveToKarakeep} disabled={karakeepSaving} variant="outline" class="w-full">
					<BookmarkIcon class="mr-2 size-4" />
					{karakeepSaving ? 'Saving...' : 'Save to Karakeep'}
				</Button>
				{#if karakeepStatus !== 'idle' && karakeepMessage}
					<div
						class="mt-2 rounded-md p-2 text-xs {karakeepStatus === 'success'
							? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
							: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'}"
					>
						{karakeepMessage}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
