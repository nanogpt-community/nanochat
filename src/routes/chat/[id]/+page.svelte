<script lang="ts">
	import { page } from '$app/state';
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import type { Id } from '$lib/db/types';
	import { session } from '$lib/state/session.svelte';
	import { watch } from 'runed';
	import LoadingDots from './loading-dots.svelte';
	import Message from './message.svelte';
	import { last } from '$lib/utils/array';
	import { settings } from '$lib/state/settings.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ShinyText from '$lib/components/animations/shiny-text.svelte';
	import GlobeIcon from '~icons/lucide/globe';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';

	const messages = useCachedQuery(api.messages.getAllFromConversation, () => ({
		conversationId: page.params.id ?? '',
	}));

	const conversation = useCachedQuery(api.conversations.getById, () => ({
		id: page.params.id as Id<'conversations'>,
	}));

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

	let changedRoute = $state(false);
	watch(
		() => page.params.id,
		() => {
			changedRoute = true;
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
			settings.webSearchEnabled = Boolean(lastUserMessage.webSearchEnabled);
		}

		changedRoute = false;
	});

	// Track previous generating state to detect when generation completes
	let wasGenerating = $state(false);

	$effect(() => {
		const isGenerating = conversation.data?.generating ?? false;
		
		if (isGenerating) {
			wasGenerating = true;
			const interval = setInterval(() => {
				conversation.refetch();
				messages.refetch();
			}, 750);
			return () => clearInterval(interval);
		} else if (wasGenerating) {
			// Generation just completed - invalidate sidebar to update title and generating status
			wasGenerating = false;
			invalidateQueryPattern(api.conversations.get.url);
			// Also refetch final messages state
			messages.refetch();
		}
	});
</script>

<svelte:head>
	<title>{conversation.data?.title} | not t3.chat</title>
</svelte:head>

<div class="flex h-full flex-1 flex-col py-4 pt-6">
	{#if !conversation.data && !conversation.isLoading}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 pt-[25svh]">
			<div>
				<h1 class="text-center font-mono text-8xl font-semibold">404</h1>
				<p class="text-muted-foreground text-center text-2xl">Conversation not found</p>
			</div>
			<Button size="sm" variant="outline" href="/chat">Create a new conversation</Button>
		</div>
	{:else}
		{#each messages.data ?? [] as message (message.id)}
			<Message {message} />
		{/each}
		{#if conversation.data?.generating}
		{#if lastMessage?.webSearchEnabled}
				{#if lastMessage?.annotations === undefined || lastMessage?.annotations?.length === 0}
					<div class="flex place-items-center gap-2">
						<GlobeIcon class="inline size-4 shrink-0" />
						<ShinyText class="text-muted-foreground text-sm">Searching the web...</ShinyText>
					</div>
				{/if}
			{:else if !lastMessageHasReasoning && !lastMessageHasContent}
				<LoadingDots />
			{:else}
				<div class="flex place-items-center gap-2">
					<div class="flex animate-[spin_0.65s_linear_infinite] place-items-center justify-center">
						<LoaderCircleIcon class="size-4" />
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
