<script lang="ts">
	import { page } from '$app/state';
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import type { Id } from '$lib/db/types';
	import type { Conversation, Message } from '$lib/api';
	import { session } from '$lib/state/session.svelte';
	import { watch } from 'runed';
	import LoadingDots from './loading-dots.svelte';
	import MessageComponent from './message.svelte';
	import { last } from '$lib/utils/array';
	import { settings } from '$lib/state/settings.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ShinyText from '$lib/components/animations/shiny-text.svelte';
	import GlobeIcon from '~icons/lucide/globe';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';
	import FollowUpQuestions from '$lib/components/ui/follow-up-questions.svelte';
	import { fly, fade } from 'svelte/transition';
	import { activeGeneration } from '$lib/state/active-generation.svelte';

	const INITIAL_VISIBLE_MESSAGES = 120;
	const LOAD_MORE_MESSAGES = 120;
	const MESSAGE_QUERY_BUFFER = 1;

	const messages = useCachedQuery<Message[]>(
		api.messages.getAllFromConversation,
		() => ({
			conversationId: page.params.id ?? '',
			limit: visibleCount + MESSAGE_QUERY_BUFFER,
		}),
		{
			enabled: () => !!page.params.id,
			staleWhileRevalidate: false,
		}
	);

	const conversation = useCachedQuery<Conversation>(api.conversations.getById, () => ({
		id: page.params.id as Id<'conversations'>,
	}));

	type StoredRating = {
		messageId: string;
		thumbs?: 'up' | 'down' | null;
		rating?: number | null;
		categories?: string[] | null;
		feedback?: string | null;
	};

	// Loaded so the rating widget can show what you already submitted; without it
	// thumbs and stars reset to empty on every reload.
	const ratings = useCachedQuery<StoredRating[]>(
		api.message_ratings.getForConversation,
		() => ({ conversationId: page.params.id ?? '' }),
		{ enabled: () => !!page.params.id && !!session.current?.user?.id }
	);

	const ratingByMessageId = $derived.by(() => {
		const map = new Map<string, NonNullable<MessageRatingValue>>();
		for (const entry of Array.isArray(ratings.data) ? ratings.data : []) {
			map.set(entry.messageId, {
				thumbs: entry.thumbs ?? undefined,
				rating: entry.rating ?? undefined,
				categories: entry.categories ?? undefined,
				feedback: entry.feedback ?? undefined,
			});
		}
		return map;
	});

	type MessageRatingValue = {
		thumbs?: 'up' | 'down';
		rating?: number;
		categories?: string[];
		feedback?: string;
	} | null;

	const safeMessages = $derived(Array.isArray(messages.data) ? messages.data : []);
	const lastMessage = $derived(safeMessages[safeMessages.length - 1] ?? null);

	const lastMessageHasContent = $derived.by(() => {
		const lastMessage = safeMessages[safeMessages.length - 1];

		if (!lastMessage) return false;

		if (lastMessage.role !== 'assistant') return false;

		return lastMessage.content.length > 0;
	});

	const lastMessageHasReasoning = $derived.by(() => {
		const lastMessage = safeMessages[safeMessages.length - 1];

		if (!lastMessage) return false;

		return lastMessage.reasoning?.length ?? 0 > 0;
	});

	let visibleCount = $state(INITIAL_VISIBLE_MESSAGES);
	const fetchedMessageCount = $derived(safeMessages.length);
	const hasMoreMessages = $derived(fetchedMessageCount > visibleCount);
	const visibleMessages = $derived(hasMoreMessages ? safeMessages.slice(1) : safeMessages);

	function loadEarlierMessages() {
		visibleCount += LOAD_MORE_MESSAGES;
	}

	let changedRoute = $state(false);
	watch(
		() => page.params.id,
		() => {
			changedRoute = true;
			visibleCount = INITIAL_VISIBLE_MESSAGES;
		}
	);

	const shouldPollConversation = $derived(
		(conversation.data?.generating ?? false) &&
			!activeGeneration.isStreamingConversation(page.params.id)
	);

	$effect(() => {
		if (shouldPollConversation) {
			const interval = setInterval(() => {
				conversation.refetch?.();
				messages.refetch?.();
			}, 750);
			return () => clearInterval(interval);
		}
	});

	$effect(() => {
		if (!changedRoute || safeMessages.length === 0) return;
		changedRoute = false;
	});

	const lastMessageWithSuggestions = $derived.by(() => {
		const lastMsg = safeMessages[safeMessages.length - 1];
		const suggestions = Array.isArray(lastMsg?.followUpSuggestions)
			? lastMsg.followUpSuggestions.filter(
					(suggestion): suggestion is string => typeof suggestion === 'string'
				)
			: [];

		if (suggestions.length === 0) {
			return null;
		}

		if (conversation.data?.generating) {
			return null;
		}

		return {
			...lastMsg,
			followUpSuggestions: suggestions,
		};
	});
</script>

<svelte:head>
	<title>{conversation.data?.title} | nanochat</title>
</svelte:head>

<div class="flex h-full flex-1 flex-col gap-4 py-2 pt-4 md:gap-6 md:py-4 md:pt-6">
	{#if !conversation.data && (conversation.isLoading || messages.isLoading)}
		<!-- Navigating between conversations clears the previous one's data, so without
		     this branch the thread area rendered an empty {#each} — a blank screen. -->
		<div class="flex flex-col gap-6" aria-busy="true" aria-label="Loading conversation">
			{#each [78, 46, 90] as width, i (i)}
				<div class="flex flex-col gap-2" class:self-end={i % 2 === 0}>
					<div class="bg-muted h-4 animate-pulse rounded" style="width: {width}%"></div>
					<div class="bg-muted h-4 w-[62%] animate-pulse rounded"></div>
				</div>
			{/each}
		</div>
	{:else if !conversation.data && conversation.error}
		<!-- A failed request is not the same as a missing conversation; claiming 404 on a
		     network error told the user their chat was gone when it was not. -->
		<div class="flex flex-1 flex-col items-center justify-center gap-4 pt-[25svh]">
			<div>
				<h1 class="text-center font-mono text-4xl font-semibold">Couldn't load this chat</h1>
				<p class="text-muted-foreground text-center text-lg">
					Check your connection and try again.
				</p>
			</div>
			<Button size="sm" variant="outline" onclick={() => location.reload()}>Retry</Button>
		</div>
	{:else if !conversation.data}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 pt-[25svh]">
			<div>
				<h1 class="text-center font-mono text-8xl font-semibold">404</h1>
				<p class="text-muted-foreground text-center text-2xl">Conversation not found</p>
			</div>
			<Button size="sm" variant="outline" href="/chat">Create a new conversation</Button>
		</div>
	{:else}
		{#if hasMoreMessages}
			<div class="flex justify-center">
				<Button size="sm" variant="outline" onclick={loadEarlierMessages}>
					Load earlier messages
				</Button>
			</div>
		{/if}
		{#each visibleMessages as message, i (message.id)}
			{@const nextMessage = visibleMessages[i + 1]}
			{@const childMessageId = nextMessage?.role === 'assistant' ? nextMessage.id : undefined}
			<MessageComponent
				{message}
				{childMessageId}
				initialRating={ratingByMessageId.get(message.id)}
			/>
		{/each}
		{#if conversation.data?.generating}
			{#if lastMessage?.webSearchEnabled}
				{#if lastMessage?.annotations === undefined || lastMessage?.annotations?.length === 0}
					<div class="flex place-items-center gap-2" in:fly={{ y: 5, duration: 300 }}>
						<GlobeIcon class="inline size-4 shrink-0" />
						<ShinyText class="text-muted-foreground text-sm">Searching the web...</ShinyText>
					</div>
				{/if}
			{:else if !lastMessageHasReasoning && !lastMessageHasContent}
				<div in:fly={{ y: 5, duration: 300 }}>
					<LoadingDots />
				</div>
			{:else}
				<div class="flex place-items-center gap-2" in:fade={{ duration: 200 }}>
					<LoaderCircleIcon class="size-4 animate-spin" />
				</div>
			{/if}
		{/if}
		{#if lastMessageWithSuggestions}
			<div in:fly={{ y: 10, duration: 400 }} class="mt-4">
				<FollowUpQuestions suggestions={lastMessageWithSuggestions.followUpSuggestions ?? []} />
			</div>
		{/if}
	{/if}
</div>

<style>
</style>
