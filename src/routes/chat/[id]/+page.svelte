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
	import { callGenerateFollowUpQuestions } from '../../../routes/api/generate-follow-up-questions/call';
	import FollowUpQuestions from '$lib/components/ui/follow-up-questions.svelte';
	import { fly, fade } from 'svelte/transition';

	const INITIAL_VISIBLE_MESSAGES = 120;
	const LOAD_MORE_MESSAGES = 120;

	const messages = useCachedQuery<Message[]>(api.messages.getAllFromConversation, () => ({
		conversationId: page.params.id ?? '',
	}));

	const conversation = useCachedQuery<Conversation>(api.conversations.getById, () => ({
		id: page.params.id as Id<'conversations'>,
	}));

	const userSettings = useCachedQuery<{ followUpQuestionsEnabled?: boolean }>(
		api.user_settings.get,
		{}
	);

	const lastMessage = $derived(messages?.data?.[messages.data?.length - 1] ?? null);

	const lastMessageHasContent = $derived.by(() => {
		if (!messages.data) return false;
		const lastMessage = messages.data[messages.data.length - 1];

		if (!lastMessage) return false;

		if (lastMessage.role !== 'assistant') return false;

		return lastMessage.content.length > 0;
	});

	const lastMessageHasReasoning = $derived.by(() => {
		if (!messages.data) return false;
		const lastMessage = messages.data[messages.data.length - 1];

		if (!lastMessage) return false;

		return lastMessage.reasoning?.length ?? 0 > 0;
	});

	let visibleCount = $state(INITIAL_VISIBLE_MESSAGES);
	const totalMessages = $derived(messages.data?.length ?? 0);
	const startIndex = $derived(Math.max(0, totalMessages - visibleCount));
	const visibleMessages = $derived(messages.data?.slice(startIndex) ?? []);

	function loadEarlierMessages() {
		visibleCount = Math.min(totalMessages, visibleCount + LOAD_MORE_MESSAGES);
	}

	let changedRoute = $state(false);
	watch(
		() => page.params.id,
		() => {
			changedRoute = true;
			visibleCount = INITIAL_VISIBLE_MESSAGES;
		}
	);

	$effect(() => {
		if (!changedRoute || !messages.data) return;
		const lastMessage = last(messages.data)!;
		if (lastMessage.modelId && lastMessage.modelId !== settings.modelId) {
			settings.modelId = lastMessage.modelId;
		}

		// Auto-enable/disable web search based on last user message
		const lastUserMessage = messages.data.filter((m) => m.role === 'user').pop();
		if (lastUserMessage) {
			if (lastUserMessage.webSearchEnabled) {
				if (settings.webSearchMode === 'off') {
					settings.webSearchMode = 'standard';
				}
			} else {
				settings.webSearchMode = 'off';
			}
		}

		changedRoute = false;
	});

	// Track previous generating state to detect when generation completes
	let wasGenerating = $state(false);

	let showSuggestionsDelay = $state<Record<string, number>>({});
	let currentSuggestionsMessageId = $state<string | null>(null);

	$effect(() => {
		const isGenerating = conversation.data?.generating ?? false;

		if (isGenerating) {
			wasGenerating = true;
			const interval = setInterval(() => {
				conversation.refetch?.();
				messages.refetch?.();
			}, 750);
			return () => clearInterval(interval);
		} else if (wasGenerating) {
			// Generation just completed
			wasGenerating = false;
			invalidateQueryPattern(api.conversations.get.url);
			messages.refetch?.();

			// NEW: Trigger follow-up questions for last assistant message
			const lastMsg = messages.data?.[messages.data?.length - 1];
			if (
				lastMsg?.role === 'assistant' &&
				lastMsg.content &&
				!lastMsg.followUpSuggestions &&
				userSettings.data?.followUpQuestionsEnabled !== false
			) {
				showSuggestionsDelay[lastMsg.id] = Date.now();
				currentSuggestionsMessageId = lastMsg.id;
				const conversationId = page.params.id;
				if (conversationId) {
					generateSuggestions(lastMsg.id, conversationId);
				}
			}
		}
	});

	// NEW: Track message refetch to detect if new message was added
	$effect(() => {
		if (!messages.data) return;

		const lastMsg = messages.data[messages.data?.length - 1];

		if (currentSuggestionsMessageId && lastMsg?.id !== currentSuggestionsMessageId) {
			delete showSuggestionsDelay[currentSuggestionsMessageId];
			currentSuggestionsMessageId = null;
		}

		// Log when historical suggestions are not found (only when not generating)
		if (lastMsg && !lastMsg.followUpSuggestions && !conversation.data?.generating) {
			console.log('[follow-up] No suggestions found for message', lastMsg.id);
		}
	});

	// NEW: Generate follow-up suggestions function
	async function generateSuggestions(messageId: string, conversationId: string) {
		const res = await callGenerateFollowUpQuestions({
			conversationId,
			messageId,
		});

		if (res.isOk()) {
			console.log('[follow-up] Suggestions generated successfully');
			invalidateQueryPattern(api.messages.getAllFromConversation.url);
		} else {
			console.log('[follow-up] Failed to generate suggestions (logged in backend)');
			currentSuggestionsMessageId = null;
		}
	}

	// NEW: Determine if suggestions should be visible
	const lastMessageWithSuggestions = $derived.by(() => {
		const lastMsg = messages.data?.[messages.data?.length - 1];

		if (!lastMsg) {
			return null;
		}

		if (!lastMsg.followUpSuggestions || lastMsg.followUpSuggestions.length === 0) {
			return null;
		}

		if (conversation.data?.generating) {
			return null;
		}

		// Check if this is a historical message (not the current session's generated message)
		const isHistorical = currentSuggestionsMessageId !== lastMsg.id;

		if (isHistorical) {
			// Historical messages show suggestions immediately
			return lastMsg;
		}

		// For current session messages, check the delay
		const delayTime = showSuggestionsDelay[lastMsg.id] ?? 0;
		const elapsed = Date.now() - delayTime;

		if (elapsed < 1000) {
			return null;
		}

		return lastMsg;
	});
</script>

<svelte:head>
	<title>{conversation.data?.title} | nanochat</title>
</svelte:head>

<div class="flex h-full flex-1 flex-col gap-4 py-2 pt-4 md:gap-6 md:py-4 md:pt-6">
	{#if !conversation.data && !conversation.isLoading}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 pt-[25svh]">
			<div>
				<h1 class="text-center font-mono text-8xl font-semibold">404</h1>
				<p class="text-muted-foreground text-center text-2xl">Conversation not found</p>
			</div>
			<Button size="sm" variant="outline" href="/chat">Create a new conversation</Button>
		</div>
	{:else}
		{#if totalMessages > visibleMessages.length}
			<div class="flex justify-center">
				<Button size="sm" variant="outline" onclick={loadEarlierMessages}>
					Load earlier messages ({totalMessages - visibleMessages.length})
				</Button>
			</div>
		{/if}
		{#each visibleMessages as message, i (message.id)}
			{@const absoluteIndex = startIndex + i}
			{@const nextMessage = messages.data?.[absoluteIndex + 1]}
			{@const childMessageId = nextMessage?.role === 'assistant' ? nextMessage.id : undefined}
			<MessageComponent {message} {childMessageId} />
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

		<!-- NEW: Show suggestions ONLY for the current session's last message after delay -->
		{#if lastMessageWithSuggestions && lastMessageWithSuggestions.followUpSuggestions}
			<div in:fly={{ y: 10, duration: 400 }} class="mt-4">
				<FollowUpQuestions suggestions={lastMessageWithSuggestions.followUpSuggestions} />
			</div>
		{/if}
	{/if}
</div>

<style>
</style>
