<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import type { Message } from '$lib/api';
	import { cn } from '$lib/utils/utils';
	import StarIcon from '~icons/lucide/star';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import Loader2Icon from '~icons/lucide/loader-2';
	import { invalidateQueryPattern } from '$lib/cache/cached-query.svelte';

	const starredMessages = useCachedQuery<Message[]>(api.starred_messages.get, {
		session_token: session.current?.session.token ?? '',
	});

	async function unstarMessage(messageId: string) {
		try {
			const res = await fetch(api.messages.setStarred.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'setStarred',
					messageId,
					starred: false,
				}),
			});

			if (res.ok) {
				invalidateQueryPattern(api.starred_messages.get.url);
			}
		} catch (e) {
			console.error('Error unstarring message:', e);
		}
	}

	function truncateContent(content: string, maxLength: number = 200): string {
		if (content.length <= maxLength) return content;
		return content.slice(0, maxLength).trim() + '...';
	}
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold">Starred Messages</h2>
		<p class="text-muted-foreground text-sm">Messages you've starred for quick reference.</p>
	</div>

	{#if starredMessages.isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader2Icon class="text-muted-foreground size-6 animate-spin" />
		</div>
	{:else if starredMessages.data && starredMessages.data.length > 0}
		<div class="space-y-4">
			{#each starredMessages.data as message (message.id)}
				<div
					class="border-border bg-card group hover:bg-accent/50 relative rounded-lg border p-4 transition-colors"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<p class="text-foreground text-sm leading-relaxed">
								{truncateContent(message.content)}
							</p>
							<div class="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
								{#if message.modelId}
									<span>{message.modelId.split('/').pop()}</span>
								{/if}
								<span>{new Date(message.createdAt).toLocaleDateString()}</span>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<a
								href="/chat/{message.conversationId}"
								class="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-colors"
								title="Go to conversation"
							>
								<ExternalLinkIcon class="size-4" />
							</a>
							<button
								type="button"
								onclick={() => unstarMessage(message.id)}
								class="hover:bg-accent rounded-md p-1.5 text-yellow-400 transition-colors hover:text-yellow-500"
								title="Unstar message"
							>
								<StarIcon class="size-4 fill-current" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="text-muted-foreground flex flex-col items-center justify-center py-12 text-center">
			<StarIcon class="mb-4 size-12 opacity-20" />
			<p class="text-lg font-medium">No starred messages yet</p>
			<p class="mt-1 text-sm">Star messages in your chats to save them here for quick access.</p>
		</div>
	{/if}
</div>
