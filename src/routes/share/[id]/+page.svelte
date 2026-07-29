<script lang="ts">
	import { page } from '$app/state';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte.js';
	import type { Conversation, Message } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/light-switch/index.js';
	import ArrowRightIcon from '~icons/lucide/arrow-right';
	import GlobeIcon from '~icons/lucide/globe';
	import MessageComponent from '../../chat/[id]/message.svelte';

	const conversationId = page.params.id;

	const conversationQuery = useCachedQuery<Conversation>(api.conversations.getPublicById, {
		id: conversationId,
	});

	const messagesQuery = useCachedQuery<Message[]>(api.messages.getByConversationPublic, {
		conversationId: conversationId,
		public: 'true',
	});

	const formatDate = (timestamp: number | Date | undefined) => {
		if (!timestamp) return '';
		const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	};
</script>

<svelte:head>
	<title>{conversationQuery.data?.title || 'Shared Chat'} | Shared Chat</title>
	<meta name="description" content="A shared conversation from nanochat" />
</svelte:head>

<div class="fill-device-height scroll-momentum overflow-y-auto overscroll-contain">
	<header
		class="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b
			backdrop-blur-lg"
	>
		<div class="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-3 sm:px-4">
			<a href="/" class="font-sans text-lg font-bold tracking-tight">nanochat</a>
			<div class="flex items-center gap-1">
				<Button
					href="/chat"
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground"
				>
					Start your own chat
				</Button>
				<ThemeToggle variant="ghost" class="size-8" />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-3xl px-3 pt-8 pb-16 sm:px-4">
		{#if conversationQuery.isLoading || messagesQuery.isLoading}
			<div class="text-muted-foreground py-20 text-center text-sm">Loading conversation...</div>
		{:else if !conversationQuery.data}
			<div class="py-20 text-center">
				<p class="mb-1 text-lg font-semibold">Conversation not found</p>
				<p class="text-muted-foreground text-sm">
					This conversation doesn't exist or isn't shared publicly.
				</p>
			</div>
		{:else}
			<div class="mb-8">
				<h1 class="font-sans text-3xl font-bold tracking-tight text-balance">
					{conversationQuery.data.title}
				</h1>
				<div class="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
					<GlobeIcon class="size-3.5" />
					<span>Public conversation</span>
					{#if conversationQuery.data.updatedAt}
						<span class="text-muted-foreground/50">·</span>
						<span>Updated {formatDate(conversationQuery.data.updatedAt)}</span>
					{/if}
				</div>
			</div>

			<div class="flex flex-col">
				{#if messagesQuery.data && messagesQuery.data.length > 0}
					{#each messagesQuery.data as message (message.id)}
						<MessageComponent {message} readonly />
					{/each}
				{:else}
					<div class="text-muted-foreground py-20 text-center text-sm">
						No messages in this conversation yet.
					</div>
				{/if}
			</div>

			<div
				class="border-border/60 mt-12 flex flex-col items-center gap-3 border-t pt-8 text-center"
			>
				<p class="text-muted-foreground text-sm">Want to pick up where this left off?</p>
				<Button href="/chat" size="sm">
					Start your own chat
					<ArrowRightIcon class="size-4" />
				</Button>
			</div>
		{/if}
	</main>
</div>
