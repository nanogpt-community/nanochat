<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import type { Doc, Id } from '$lib/db/types';
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

	let { searchModalOpen = $bindable(false) }: { searchModalOpen: boolean } = $props();

	const controls = useSidebarControls();

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

	const settings = useCachedQuery(api.user_settings.get, {
		session_token: session.current?.session.token ?? '',
	});

	const conversationsQuery = useCachedQuery(api.conversations.get, {
		session_token: session.current?.session.token ?? '',
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
		<span class="text-center font-sans text-xl font-bold tracking-tight">T3.chat</span>
		<div class="size-9"></div>
	</div>
	<div class="mt-2 flex w-full flex-col gap-2 px-2">
		<Tooltip>
			{#snippet trigger(tooltip)}
				<a
					href="/chat"
					class="bg-primary hover:opacity-90 text-primary-foreground font-fake-proxima w-full rounded-lg px-4 py-2 text-center text-sm font-semibold tracking-[-0.01em] transition-all duration-200"
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
			class="text-muted-foreground/70 hover:text-foreground flex items-center gap-2 px-3 py-2 text-sm transition-all bg-secondary/20 rounded-lg border border-transparent hover:border-border"
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
						<h3 class="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
							{#if IconComponent}
								<IconComponent class="inline size-3 mr-1" />
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
									{ 'bg-sidebar-accent text-sidebar-accent-foreground': isActive, 'hover:bg-sidebar-accent/50': !isActive }
								)}
							>
								<p class="truncate rounded-lg py-2 pr-4 pl-3 whitespace-nowrap">
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
									<span class="font-medium">{conversation?.title ?? 'Untitled'}</span>
								</p>
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
								>
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
	<div class="py-2 px-2">
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
						<span {...avatar.fallback} class="size-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
							{page.data.session?.user.name
								.split(' ')
								.map((name: string) => name[0]?.toUpperCase())
								.join('')}
						</span>
					{/snippet}
				</Avatar>
				<div class="flex flex-col min-w-0">
					<span class={cn('text-sm font-medium truncate', { 'blur-[6px]': settings.data?.privacyMode })}>
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
