<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import type { Doc, Id } from '$lib/db/types';
	import type { Conversation, UserSettings } from '$lib/api';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { useSidebarControls } from '$lib/components/ui/sidebar';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte';
	import { session } from '$lib/state/session.svelte';
	import { cn } from '$lib/utils/utils.js';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Avatar } from 'melt/components';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';
	import PanelLeftIcon from '~icons/lucide/panel-left';
	import PinIcon from '~icons/lucide/pin';
	import PinOffIcon from '~icons/lucide/pin-off';
	import XIcon from '~icons/lucide/x';
	import { Button } from './ui/button';
	import { callModal } from './ui/modal/global-modal.svelte';
	import SplitIcon from '~icons/lucide/split';
	import SearchIcon from '~icons/lucide/search';
	import LogInIcon from '~icons/lucide/log-in';
	import PencilIcon from '~icons/lucide/pencil';
	import CheckIcon from '~icons/lucide/check';
	import { Input } from '$lib/components/ui/input';

	let { searchModalOpen = $bindable(false) }: { searchModalOpen: boolean } = $props();

	const controls = useSidebarControls();

	let editingConversationId = $state<string | null>(null);
	let editingTitle = $state('');

	function startRenaming(conversation: Doc<'conversations'>) {
		editingConversationId = conversation.id;
		editingTitle = conversation.title;
	}

	async function saveRename() {
		if (!editingConversationId || !session.current?.session.token) return;

		const id = editingConversationId;
		const title = editingTitle.trim();

		// Optimistic update
		editingConversationId = null;

		await mutate(api.conversations.updateTitle.url, {
			action: 'updateTitle',
			conversationId: id,
			title,
		});

		invalidateQueryPattern(api.conversations.get.url);
	}

	function cancelRename() {
		editingConversationId = null;
		editingTitle = '';
	}

	function autofocus(node: HTMLElement) {
		node.focus();
	}

	async function togglePin(conversationId: string) {
		if (!session.current?.session.token) return;

		await mutate(api.conversations.togglePin.url, {
			action: 'togglePin',
			conversationId,
		});

		invalidateQueryPattern(api.conversations.get.url);
	}

	async function deleteConversation(conversationId: string) {
		const res = await callModal({
			title: 'Delete conversation',
			description: 'Are you sure you want to delete this conversation?',
			actions: { cancel: 'outline', delete: 'destructive' },
		});

		if (res !== 'delete') return;

		if (!session.current?.session.token) return;

		await fetch(`/api/db/conversations?id=${conversationId}`, {
			method: 'DELETE',
			credentials: 'include',
		});

		// Invalidate the conversations cache so the sidebar updates immediately
		invalidateQueryPattern(api.conversations.get.url);

		await goto(`/chat`);
	}

	const settings = useCachedQuery<UserSettings>(api.user_settings.get, {
		session_token: session.current?.session.token ?? '',
	});

	const conversationsQuery = useCachedQuery<Conversation[]>(api.conversations.get, {
		session_token: session.current?.session.token ?? '',
	});

	// Track previous generating state to detect when generation completes
	let wasGenerating = $state(false);
	const hasGeneratingConversation = $derived(
		conversationsQuery.data?.some((c) => c.generating) ?? false
	);

	// Poll for updates while a conversation is generating (to catch title updates)
	// and do a final refresh when generation completes
	$effect(() => {
		if (hasGeneratingConversation) {
			wasGenerating = true;
			// Poll every 3 seconds while generating to catch title updates
			const interval = setInterval(() => {
				invalidateQueryPattern(api.conversations.get.url);
			}, 3000);
			return () => clearInterval(interval);
		} else if (wasGenerating) {
			// Generation just completed, do a final refresh to catch the title
			wasGenerating = false;
			// Small delay to ensure title generation has completed
			setTimeout(() => {
				invalidateQueryPattern(api.conversations.get.url);
			}, 1000);
		}
	});

	function groupConversationsByTime(conversations: Doc<'conversations'>[]) {
		const now = Date.now();
		const oneDay = 24 * 60 * 60 * 1000;
		const sevenDays = 7 * oneDay;
		const thirtyDays = 30 * oneDay;

		const groups = {
			pinned: [] as Doc<'conversations'>[],
			today: [] as Doc<'conversations'>[],
			yesterday: [] as Doc<'conversations'>[],
			lastWeek: [] as Doc<'conversations'>[],
			lastMonth: [] as Doc<'conversations'>[],
			older: [] as Doc<'conversations'>[],
		};

		conversations.forEach((conversation) => {
			if (!conversation) return;
			// Pinned conversations go to pinned group regardless of time
			if (conversation.pinned) {
				groups.pinned.push(conversation);
				return;
			}

			const updatedAt = conversation.updatedAt ? new Date(conversation.updatedAt).getTime() : 0;
			const timeDiff = now - updatedAt;

			if (timeDiff < oneDay) {
				groups.today.push(conversation);
			} else if (timeDiff < 2 * oneDay) {
				groups.yesterday.push(conversation);
			} else if (timeDiff < sevenDays) {
				groups.lastWeek.push(conversation);
			} else if (timeDiff < thirtyDays) {
				groups.lastMonth.push(conversation);
			} else {
				groups.older.push(conversation);
			}
		});

		// Sort pinned conversations by updatedAt (most recent first)
		groups.pinned.sort((a, b) => {
			const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
			const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
			return bTime - aTime;
		});

		return groups;
	}

	const groupedConversations = $derived(groupConversationsByTime(conversationsQuery.data ?? []));

	const templateConversations = $derived([
		{ key: 'pinned', label: 'Pinned', conversations: groupedConversations.pinned, icon: PinIcon },
		{ key: 'today', label: 'Today', conversations: groupedConversations.today },
		{ key: 'yesterday', label: 'Yesterday', conversations: groupedConversations.yesterday },
		{ key: 'lastWeek', label: 'Last 7 days', conversations: groupedConversations.lastWeek },
		{ key: 'lastMonth', label: 'Last 30 days', conversations: groupedConversations.lastMonth },
		{ key: 'older', label: 'Older', conversations: groupedConversations.older },
	]);
</script>

<Sidebar.Sidebar class="flex flex-col overflow-clip p-2">
	<div class="flex place-items-center justify-between py-2">
		<div>
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Sidebar.Trigger {...tooltip.trigger}>
						<PanelLeftIcon />
					</Sidebar.Trigger>
				{/snippet}
				Toggle Sidebar ({cmdOrCtrl} + B)
			</Tooltip>
		</div>
		<span class="text-center font-sans text-xl font-bold tracking-tight">nanochat</span>
		<div class="size-9"></div>
	</div>
	<div class="mt-2 flex w-full flex-col gap-2 px-2">
		<Tooltip>
			{#snippet trigger(tooltip)}
				<a
					href="/chat"
					class="bg-primary text-primary-foreground font-fake-proxima w-full rounded-lg px-4 py-2 text-center text-sm font-semibold tracking-[-0.01em] transition-all duration-200 hover:opacity-90"
					{...tooltip.trigger}
					onclick={controls.closeMobile}
				>
					New Chat
				</a>
			{/snippet}
			New Chat ({cmdOrCtrl} + Shift + O)
		</Tooltip>
	</div>
	<div class="mt-2 flex w-full flex-col gap-2 px-2">
		<button
			type="button"
			class="text-muted-foreground/70 hover:text-foreground bg-secondary/20 hover:border-border flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm transition-all"
			onclick={() => (searchModalOpen = true)}
		>
			<SearchIcon class="size-4" />
			<span>Search threads...</span>
		</button>
	</div>
	<div class="relative flex min-h-0 flex-1 shrink-0 flex-col overflow-clip">
		<div
			class="from-sidebar pointer-events-none absolute top-0 right-0 left-0 z-10 h-4 bg-gradient-to-b to-transparent"
		></div>
		<div class="flex flex-1 flex-col overflow-y-auto py-2">
			{#each templateConversations as group, index (group.key)}
				{@const IconComponent = group.icon}
				{#if group.conversations.length > 0}
					<div class="px-2 py-1" class:mt-2={index > 0}>
						<h3 class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
							{#if IconComponent}
								<IconComponent class="mr-1 inline size-3" />
							{/if}
							{group.label}
						</h3>
					</div>
					{#each group.conversations as conversation (conversation.id)}
						{@const isActive = page.params.id === conversation.id}
						<a
							href={`/chat/${conversation.id}`}
							onclick={controls.closeMobile}
							class="group w-full py-0.5 pr-2.5 text-left text-sm"
						>
							<div
								class={cn(
									'relative flex w-full items-center justify-between overflow-clip rounded-lg transition-colors',
									{
										'bg-sidebar-accent text-sidebar-accent-foreground': isActive,
										'hover:bg-sidebar-accent/50': !isActive,
									}
								)}
							>
								<div class="truncate rounded-lg py-2 pr-4 pl-3 whitespace-nowrap">
									{#if conversation.branchedFrom}
										<Tooltip>
											{#snippet trigger(tooltip)}
												<button
													type="button"
													class="hover:text-foreground text-muted-foreground/50 cursor-pointer transition-all"
													onclick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														goto(`/chat/${conversation.branchedFrom}`);
													}}
													{...tooltip.trigger}
												>
													<SplitIcon class="mr-1 inline size-4" />
												</button>
											{/snippet}
											Go to original conversation
										</Tooltip>
									{/if}
									{#if editingConversationId === conversation.id}
										<div class="flex items-center gap-1 pr-2">
											<input
												class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-7 w-full rounded-md border px-2 py-1 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
												bind:value={editingTitle}
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
												}}
												onkeydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														saveRename();
													} else if (e.key === 'Escape') {
														e.preventDefault();
														cancelRename();
													}
												}}
												use:autofocus
											/>
											<button
												class="hover:bg-muted rounded-md p-1 text-green-500"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													saveRename();
												}}
											>
												<CheckIcon class="size-4" />
											</button>
											<button
												class="hover:bg-muted rounded-md p-1 text-red-500"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													cancelRename();
												}}
											>
												<XIcon class="size-4" />
											</button>
										</div>
									{:else}
										<span class="font-medium">{conversation?.title ?? 'Untitled'}</span>
									{/if}
								</div>
								<div class="pr-2">
									{#if conversation.generating}
										<div
											class="flex animate-[spin_0.75s_linear_infinite] place-items-center justify-center"
										>
											<LoaderCircleIcon class="size-4" />
										</div>
									{/if}
								</div>
								<div
									class={[
										'pointer-events-none absolute inset-y-0.5 right-0 flex translate-x-full items-center gap-2 rounded-r-lg pr-2 pl-6 transition group-hover:pointer-events-auto group-hover:translate-0',
										'to-sidebar-accent via-sidebar-accent bg-gradient-to-r from-transparent from-10% via-21% ',
									]}
									class:hidden={editingConversationId === conversation.id}
								>
									<Tooltip>
										{#snippet trigger(tooltip)}
											<button
												{...tooltip.trigger}
												class="hover:bg-muted rounded-md p-1"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													startRenaming(conversation);
												}}
											>
												<PencilIcon class="size-4" />
											</button>
										{/snippet}
										Rename thread
									</Tooltip>
									<Tooltip>
										{#snippet trigger(tooltip)}
											<button
												{...tooltip.trigger}
												class="hover:bg-muted rounded-md p-1"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													togglePin(conversation.id);
												}}
											>
												{#if conversation.pinned}
													<PinOffIcon class="size-4" />
												{:else}
													<PinIcon class="size-4" />
												{/if}
											</button>
										{/snippet}
										{conversation.pinned ? 'Unpin thread' : 'Pin thread'}
									</Tooltip>
									<Tooltip>
										{#snippet trigger(tooltip)}
											<button
												{...tooltip.trigger}
												class="hover:bg-muted rounded-md p-1"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													deleteConversation(conversation.id);
												}}
											>
												<XIcon class="size-4" />
											</button>
										{/snippet}
										Delete thread
									</Tooltip>
								</div>
							</div>
						</a>
					{/each}
				{/if}
			{/each}
		</div>
		<div
			class="from-sidebar pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-4 bg-gradient-to-t to-transparent"
		></div>
	</div>
	<div class="px-2 py-2">
		{#if page.data.session !== null}
			<Button href="/account" variant="ghost" class="h-auto w-full justify-start gap-3 px-3 py-2">
				<Avatar src={page.data.session?.user.image ?? undefined}>
					{#snippet children(avatar)}
						<img
							{...avatar.image}
							alt="Your avatar"
							class={cn('size-8 rounded-full', {
								'blur-[6px]': settings.data?.privacyMode,
							})}
						/>
						<span
							{...avatar.fallback}
							class={cn(
								'bg-primary/20 flex size-8 items-center justify-center rounded-full text-xs font-bold',
								{
									'blur-[6px]': settings.data?.privacyMode,
								}
							)}
						>
							{page.data.session?.user.name
								.split(' ')
								.map((name: string) => name[0]?.toUpperCase())
								.join('')}
						</span>
					{/snippet}
				</Avatar>
				<div class="flex min-w-0 flex-col">
					<span
						class={cn('truncate text-sm font-medium', { 'blur-[6px]': settings.data?.privacyMode })}
					>
						{page.data.session?.user.name}
					</span>
				</div>
			</Button>
		{:else}
			<Button href="/login" variant="ghost" class="w-full justify-start gap-2 px-3">
				<LogInIcon class="size-4" />
				Login
			</Button>
		{/if}
	</div>
</Sidebar.Sidebar>
