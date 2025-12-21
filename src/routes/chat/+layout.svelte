<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte.js';
	import type { Doc, Id } from '$lib/db/types';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ImageModal } from '$lib/components/ui/image-modal';
	import { LightSwitch } from '$lib/components/ui/light-switch/index.js';
	import { ShareButton } from '$lib/components/ui/share-button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte.js';
	import { TextareaAutosize } from '$lib/spells/textarea-autosize.svelte.js';
	import { models } from '$lib/state/models.svelte';
	import { usePrompt } from '$lib/state/prompt.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { Provider } from '$lib/types';
	import { compressImage } from '$lib/utils/image-compression';
	import { supportsImages, supportsReasoning } from '$lib/utils/model-capabilities';
	import { omit, pick } from '$lib/utils/object.js';
	import { cn } from '$lib/utils/utils.js';
	import { mutate } from '$lib/client/mutation.svelte';
	import { FileUpload, Popover } from 'melt/builders';
	import { Debounced, ElementSize, IsMounted, PersistedState, ScrollState } from 'runed';
	import { fade, scale } from 'svelte/transition';
	import SendIcon from '~icons/lucide/arrow-up';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ImageIcon from '~icons/lucide/image';
	import PanelLeftIcon from '~icons/lucide/panel-left';
	import SearchIcon from '~icons/lucide/search';
	import Settings2Icon from '~icons/lucide/settings-2';
	import StopIcon from '~icons/lucide/square';
	import UploadIcon from '~icons/lucide/upload';
	import XIcon from '~icons/lucide/x';
	import { callCancelGeneration } from '../api/cancel-generation/call.js';
	import { callGenerateMessage } from '../api/generate-message/call.js';
	import { ModelPicker } from '$lib/components/model-picker';
	import SearchModal from './search-modal.svelte';
	import { shortcut } from '$lib/actions/shortcut.svelte.js';
	import { mergeAttrs } from 'melt';
	import { callEnhancePrompt } from '../api/enhance-prompt/call.js';
	import ShinyText from '$lib/components/animations/shiny-text.svelte';
	import SparkleIcon from '~icons/lucide/sparkle';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import BrainIcon from '~icons/lucide/brain';
import BotIcon from '~icons/lucide/bot';
import * as casing from '$lib/utils/casing.js';

let { children } = $props();

let textarea = $state<HTMLTextAreaElement>();
let abortController = $state<AbortController | null>(null);

const assistantsQuery = useCachedQuery(api.assistants.all, {
    session_token: session.current?.session.token ?? '',
});

let selectedAssistantId = $state<string | null>(null);
const selectedAssistant = $derived(assistantsQuery.data?.find(a => a.id === selectedAssistantId));

$effect(() => {
    if (selectedAssistant) {
        settings.modelId = selectedAssistant.modelId;
    }
});

$effect(() => {
    // Enable initial models for new users
		mutate(api.user_enabled_models.enable_initial.url, {
			action: 'enableInitial',
		}, {
			invalidatePatterns: [api.user_enabled_models.get_enabled.url]
		});
	});

	const currentConversationQuery = useCachedQuery(api.conversations.getById, () => ({
		id: page.params.id,
	}));

	const isGenerating = $derived(
		Boolean(currentConversationQuery.data?.generating) || 
		(page.params.id ? currentConversationQuery.isLoading : false)
	);

	async function stopGeneration() {
		if (!page.params.id || !session.current?.session.token) return;

		try {
			const result = await callCancelGeneration({
				conversation_id: page.params.id,
				session_token: session.current.session.token,
			});

			if (result.isErr()) {
				console.error('Failed to cancel generation:', result.error);
			} else {
				console.log('Generation cancelled:', result.value.cancelled);
			}
		} catch (error) {
			console.error('Error cancelling generation:', error);
		}

		// Clear local abort controller if it exists
		if (abortController) {
			abortController = null;
		}
	}

	let loading = $state(false);

	let enhancingPrompt = $state(false);

	const textareaDisabled = $derived(
		isGenerating ||
			loading ||
			(page.params.id &&
				currentConversationQuery.data &&
				currentConversationQuery.data.userId !== session.current?.user.id) ||
			enhancingPrompt
	);

	let error = $state<string | null>(null);

	async function handleSubmit() {
		if (isGenerating) return;

		error = null;

		// TODO: Re-use zod here from server endpoint for better error messages?
		if (message.current === '' || !session.current?.user.id || !settings.modelId) return;

		loading = true;

		const imagesCopy = [...selectedImages];
		selectedImages = [];

		try {
			const res = await callGenerateMessage({
				message: message.current,
				session_token: session.current?.session.token,
				conversation_id: page.params.id ?? undefined,
            model_id: settings.modelId,
            assistant_id: selectedAssistantId ?? undefined,
            images: imagesCopy.length > 0 ? imagesCopy : undefined,
				web_search_mode: settings.webSearchMode,
				reasoning_effort: currentModelSupportsReasoning ? settings.reasoningEffort : undefined,
			});

			if (res.isErr()) {
				error = res._unsafeUnwrapErr() ?? 'An unknown error occurred';
				return;
			}

			const cid = res.value.conversation_id;

			// Invalidate relevant queries to trigger updates
			invalidateQueryPattern(api.conversations.getById.url);
			invalidateQueryPattern(api.messages.getAllFromConversation.url);
			// Always invalidate sidebar to update timestamps and pick up new chats
			invalidateQueryPattern(api.conversations.get.url);

			if (page.params.id !== cid) {
				goto(`/chat/${cid}`);
			}
		} catch (error) {
			console.error('Error generating message:', error);
		} finally {
			loading = false;
			message.current = '';
		}
	}


	let abortEnhance: AbortController | null = $state(null);

	async function enhancePrompt() {
		if (!session.current?.session.token) return;

		enhancingPrompt = true;

		abortEnhance = new AbortController();

		const res = await callEnhancePrompt(
			{
				prompt: message.current,
			},
			{
				signal: abortEnhance.signal,
			}
		);

		if (res.isErr()) {
			const e = res.error;

			if (e.toLowerCase().includes('aborterror')) {
				enhancingPrompt = false;
				return;
			}

			error = res._unsafeUnwrapErr() ?? 'An unknown error occurred while enhancing the prompt';

			enhancingPrompt = false;
			return;
		}

		message.current = res.value.enhanced_prompt;

		enhancingPrompt = false;
	}

	const rulesQuery = useCachedQuery(api.user_rules.all, {
		session_token: session.current?.session.token ?? '',
	});

	const autosize = new TextareaAutosize();

	const message = new PersistedState('prompt', '', {
		serializer: {
			serialize: (value: string) => JSON.stringify(value),
			deserialize: (value: string) => {
				try {
					return JSON.parse(value) as string;
				} catch {
					// If parsing fails, clear the corrupted value and return default
					if (typeof window !== 'undefined') {
						localStorage.removeItem('prompt');
					}
					return '';
				}
			},
		},
	});
	let selectedImages = $state<{ url: string; storage_id: string; fileName?: string }[]>([]);
	let isUploading = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let imageModal = $state<{ open: boolean; imageUrl: string; fileName: string }>({
		open: false,
		imageUrl: '',
		fileName: '',
	});

	usePrompt(
		() => message.current,
		(v) => (message.current = v)
	);

	models.init();

	const currentModelSupportsImages = $derived.by(() => {
		return true;
	});

	const currentModelSupportsReasoning = $derived.by(() => {
		if (!settings.modelId) return false;
		const nanoGPTModels = models.from(Provider.NanoGPT);
		const currentModel = nanoGPTModels.find((m) => m.id === settings.modelId);
		if (!currentModel) return false;
		return supportsReasoning(currentModel);
	});

	const fileUpload = new FileUpload({
		multiple: true,
		accept: 'image/*',
		maxSize: 10 * 1024 * 1024, // 10MB
	});

	async function handleFileChange(files: File[]) {
		if (!files.length || !session.current?.session.token) return;

		isUploading = true;
		const uploadedFiles: { url: string; storage_id: string; fileName?: string }[] = [];

		try {
			for (const file of files) {
				// Skip non-image files
				if (!file.type.startsWith('image/')) {
					console.warn('Skipping non-image file:', file.name);
					continue;
				}

				// Compress image to max 1MB
				const compressedFile = await compressImage(file, 1024 * 1024);

				// Upload file to local storage API
				const uploadResult = await fetch('/api/storage', {
					method: 'POST',
					headers: {
						'Content-Type': file.type,
					},
					credentials: 'include',
					body: compressedFile,
				});

				if (!uploadResult.ok) {
					throw new Error(`Upload failed: ${uploadResult.statusText}`);
				}

				const { storageId, url } = await uploadResult.json();

				if (url) {
					uploadedFiles.push({ url, storage_id: storageId, fileName: file.name });
				}
			}

			selectedImages = [...selectedImages, ...uploadedFiles];
		} catch (error) {
			console.error('Upload failed:', error);
		} finally {
			isUploading = false;
		}
	}

	function removeImage(index: number) {
		selectedImages = selectedImages.filter((_, i) => i !== index);
	}

	function openImageModal(imageUrl: string, fileName: string) {
		imageModal = {
			open: true,
			imageUrl,
			fileName,
		};
	}

	$effect(() => {
		if (fileUpload.selected.size > 0) {
			handleFileChange(Array.from(fileUpload.selected));
			fileUpload.clear();
		}
	});

	const suggestedRules = $derived.by(() => {
		if (!rulesQuery.data || rulesQuery.data.length === 0) return;
		if (!textarea) return;

		const cursor = textarea.selectionStart;

		const index = message.current.lastIndexOf('@', cursor);
		if (index === -1) return;

		const ruleFromCursor = message.current.slice(index + 1, cursor);

		const suggestions: Doc<'user_rules'>[] = [];

		for (const rule of rulesQuery.data) {
			// on a match, don't show any suggestions
			if (rule.name === ruleFromCursor) return;

			if (rule.name.toLowerCase().startsWith(ruleFromCursor.toLowerCase())) {
				suggestions.push(rule);
			}
		}

		return suggestions.length > 0 ? suggestions : undefined;
	});

	const popover = new Popover({
		floatingConfig: {
			computePosition: { placement: 'top' },
		},
	});

	function completeRule(rule: Doc<'user_rules'>) {
		if (!textarea) return;

		const cursor = textarea.selectionStart;

		const index = message.current.lastIndexOf('@', cursor);
		if (index === -1) return;

		message.current =
			message.current.slice(0, index) + `@${rule.name}` + message.current.slice(cursor);
		textarea.selectionStart = index + rule.name.length + 1;
		textarea.selectionEnd = index + rule.name.length + 1;

		popover.open = false;
	}

	function completeSelectedRule() {
		if (!suggestedRules) return;

		const rules = Array.from(ruleList.querySelectorAll('[data-list-item]'));

		const activeIndex = rules.findIndex((r) => r.getAttribute('data-active') === 'true');
		if (activeIndex === -1) return;

		const rule = suggestedRules[activeIndex];

		if (!rule) return;

		completeRule(rule);
	}

	let ruleList = $state<HTMLDivElement>(null!);

	function handleKeyboardNavigation(direction: 'up' | 'down') {
		if (!suggestedRules) return;

		const rules = Array.from(ruleList.querySelectorAll('[data-list-item]'));

		let activeIndex = rules?.findIndex((r) => r.getAttribute('data-active') === 'true');
		if (activeIndex === -1) {
			if (!suggestedRules[0]) return;

			rules[0]?.setAttribute('data-active', 'true');
			return;
		}

		// don't loop
		if (direction === 'up' && activeIndex === 0) {
			return;
		}
		// don't loop
		if (direction === 'down' && activeIndex === suggestedRules.length - 1) {
			return;
		}

		rules[activeIndex]?.setAttribute('data-active', 'false');

		if (direction === 'up') {
			const newIndex = activeIndex - 1;
			if (!suggestedRules[newIndex]) return;

			rules[newIndex]?.setAttribute('data-active', 'true');
		} else {
			const newIndex = activeIndex + 1;
			if (!suggestedRules[newIndex]) return;

			rules[newIndex]?.setAttribute('data-active', 'true');
		}
	}

	const textareaSize = new ElementSize(() => textarea);

	let textareaWrapper = $state<HTMLDivElement>();
	const wrapperSize = new ElementSize(() => textareaWrapper);

	let conversationList = $state<HTMLDivElement>();
	const scrollState = new ScrollState({
		element: () => conversationList,
	});

	const mounted = new IsMounted();

	const notAtBottom = new Debounced(
		() => (mounted.current ? !scrollState.arrived.bottom : false),
		() => (mounted.current ? 250 : 0)
	);

	let searchModalOpen = $state(false);

	function openSearchModal() {
		searchModalOpen = true;
	}

	let sidebarOpen = $state(false);
</script>

<svelte:head>
	<title>Chat | not t3.chat</title>
	<meta
		name="viewport"
		content="width=device-width, initial-scale=1, viewport-fit=cover"
	/>
</svelte:head>

<svelte:window
	use:shortcut={[{ ctrl: true, key: 'd', callback: () => scrollState.scrollToBottom() }]}
/>

<Sidebar.Root
	bind:open={sidebarOpen}
	class="bg-sidebar fill-device-height overflow-clip"
	{...currentModelSupportsImages ? omit(fileUpload.dropzone, ['onclick']) : {}}
>
	<AppSidebar bind:searchModalOpen />

	<Sidebar.Inset
		class="bg-background relative flex min-h-svh flex-1 flex-col overflow-clip md:m-2 md:rounded-2xl md:border md:border-border"
	>
		{#if !sidebarOpen}
			<!-- header - top left -->
			<div
				class={cn(
					'bg-sidebar/50 fixed top-4 left-4 z-50 flex w-fit rounded-lg p-1 backdrop-blur-lg ',
					{
						'md:left-(--sidebar-width)': sidebarOpen,
						'hidden md:flex': sidebarOpen,
					}
				)}
			>
				<Tooltip>
					{#snippet trigger(tooltip)}
						<Sidebar.Trigger class="size-8" {...tooltip.trigger}>
							<PanelLeftIcon />
						</Sidebar.Trigger>
					{/snippet}
					Toggle Sidebar ({cmdOrCtrl} + B)
				</Tooltip>
			</div>
		{/if}

		<!-- header - top right -->
		<div
			class={cn('bg-sidebar/50 fixed top-4 right-4 z-50 flex rounded-lg p-1 backdrop-blur-lg ', {
				'hidden md:flex': sidebarOpen,
			})}
		>
			{#if page.params.id && currentConversationQuery.data}
				<ShareButton conversationId={page.params.id as Id<'conversations'>} />
			{/if}
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Button
						onclick={openSearchModal}
						variant="ghost"
						size="icon"
						class="size-8"
						{...tooltip.trigger}
					>
						<SearchIcon class="!size-4" />
						<span class="sr-only">Search</span>
					</Button>
				{/snippet}
				Search ({cmdOrCtrl} + K)
			</Tooltip>
			<Tooltip>
				{#snippet trigger(tooltip)}
					<Button variant="ghost" size="icon" class="size-8" href="/account" {...tooltip.trigger}>
						<Settings2Icon />
					</Button>
				{/snippet}
				Settings
			</Tooltip>
			<LightSwitch variant="ghost" class="size-8" />
		</div>
		<div class="relative">
			<div bind:this={conversationList} class="fill-device-height overflow-y-auto">
				<div
					class={cn('mx-auto flex max-w-3xl flex-col', {
						'pt-10': page.url.pathname !== '/chat',
					})}
					style="padding-bottom: {page.url.pathname !== '/chat' ? wrapperSize.height : 0}px;"
				>
					{@render children()}
				</div>
				<Tooltip placement="top">
					{#snippet trigger(tooltip)}
						<Button
							onclick={() => scrollState.scrollToBottom()}
							variant="secondary"
							size="sm"
							class={[
								'text-muted-foreground !border-border absolute bottom-0 left-1/2 z-10 -translate-x-1/2 rounded-full !border !pl-3 text-xs transition',
								notAtBottom.current ? 'opacity-100' : 'pointer-events-none scale-95 opacity-0',
							]}
							{...mergeAttrs(tooltip.trigger, {
								style: `bottom: ${wrapperSize.height + 5}px;`,
							})}
						>
							Scroll to bottom
							<ChevronDownIcon class="inline" />
						</Button>
					{/snippet}
					{cmdOrCtrl} + D
				</Tooltip>
			</div>

			<div
				class="group absolute bottom-4 left-0 right-0 mx-auto mt-auto flex w-full max-w-3xl flex-col gap-1 px-4"
				bind:this={textareaWrapper}
			>
				<div class="mb-2 text-center text-[10px] text-muted-foreground/60">
					Powered by <a href="https://nano-gpt.com" class="underline hover:text-foreground">Nano-GPT</a>
				</div>
				<div
					class="bg-secondary/40 rounded-2xl p-2.5 backdrop-blur-xl border border-border shadow-2xl"
				>
					<form
						class="relative flex w-full flex-col items-stretch gap-2 transition duration-200"
						onsubmit={(e) => {
							e.preventDefault();
							handleSubmit();
						}}
					>
						{#if error}
							<div
								in:fade={{ duration: 150 }}
								class="bg-background absolute top-0 left-0 -translate-y-12 rounded-lg"
							>
								<div class="rounded-lg bg-red-500/50 px-3 py-1 text-sm text-red-100">
									{error}
								</div>
							</div>
						{/if}
						{#if suggestedRules}
							<div
								{...popover.content}
								class="bg-popover text-popover-foreground border-border absolute bottom-full mb-2 rounded-lg border shadow-lg"
								style="width: {textareaSize.width}px"
							>
								<div class="flex flex-col p-2" bind:this={ruleList}>
									{#each suggestedRules as rule, i (rule.id)}
										<button
											type="button"
											data-list-item
											data-active={i === 0}
											onmouseover={(e) => {
												for (const rule of ruleList.querySelectorAll('[data-list-item]')) {
													rule.setAttribute('data-active', 'false');
												}

												e.currentTarget.setAttribute('data-active', 'true');
											}}
											onfocus={(e) => {
												for (const rule of ruleList.querySelectorAll('[data-list-item]')) {
													rule.setAttribute('data-active', 'false');
												}

												e.currentTarget.setAttribute('data-active', 'true');
											}}
											onclick={() => completeRule(rule)}
											class="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground rounded-md px-2 py-1 text-start transition-colors"
										>
											{rule.name}
										</button>
									{/each}
								</div>
							</div>
						{/if}
						<div class="flex flex-grow flex-col">
							{#if selectedImages.length > 0}
								<div class="mb-2 flex flex-wrap gap-2 px-2 pt-2">
									{#each selectedImages as image, index (image.storage_id)}
										<div
											class="group border-border bg-muted relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border p-1 transition-all"
										>
											<button
												type="button"
												onclick={() => openImageModal(image.url, image.fileName || 'image')}
												class="block size-full overflow-hidden rounded-lg"
											>
												<img
													src={image.url}
													alt="Uploaded"
													class="size-full object-cover transition-opacity hover:opacity-80"
												/>
											</button>
											<button
												type="button"
												onclick={() => removeImage(index)}
												class="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 cursor-pointer rounded-full p-1 opacity-0 transition group-hover:opacity-100 shadow-sm"
											>
												<XIcon class="h-3 w-3" />
											</button>
										</div>
									{/each}
								</div>
							{/if}
							<div class="relative flex flex-grow flex-row items-start">
								<input {...fileUpload.input} bind:this={fileInput} />
								<textarea
									{...pick(popover.trigger, ['id', 'style', 'onfocusout', 'onfocus'])}
									bind:this={textarea}
									disabled={textareaDisabled}
									class="text-foreground placeholder:text-muted-foreground/40 max-h-64 min-h-[40px] w-full resize-none !overflow-y-auto bg-transparent px-4 py-2 text-[15px] leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[50px]"
									placeholder={isGenerating
										? 'Generating response...'
										: 'Type your message here...'}
									name="message"
									onkeydown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey && !popover.open) {
											e.preventDefault();
											handleSubmit();
										}

										if (e.key === 'Enter' && popover.open) {
											e.preventDefault();
											completeSelectedRule();
										}

										if (e.key === 'Escape' && popover.open) {
											e.preventDefault();
											popover.open = false;
										}

										if (e.key === 'ArrowUp' && popover.open) {
											e.preventDefault();
											handleKeyboardNavigation('up');
										}

										if (e.key === 'ArrowDown' && popover.open) {
											e.preventDefault();
											handleKeyboardNavigation('down');
										}

										if (e.key === '@' && !popover.open) {
											popover.open = true;
										}
									}}
									bind:value={message.current}
									autofocus
									autocomplete="off"
									{@attach autosize.attachment}
								></textarea>
							</div>
							<div class="mt-1 flex w-full flex-row items-end justify-between px-2 pb-1">
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <ModelPicker
                                        class="bg-secondary/50 hover:bg-secondary text-muted-foreground flex h-9 items-center justify-center rounded-lg px-2.5 transition-colors"
                                        onlyImageModels={selectedImages.length > 0}
                                    />
                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger class="bg-secondary/50 hover:bg-secondary text-muted-foreground flex h-9 items-center justify-center gap-2 rounded-lg px-2.5 transition-colors">
                                            {#if selectedAssistant}
                                                <BotIcon class="size-4" />
                                                <span class="max-w-[100px] truncate text-xs">{selectedAssistant.name}</span>
                                            {:else}
                                                <BotIcon class="size-4 opacity-50" />
                                            {/if}
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Content>
                                            <DropdownMenu.Label>Select Assistant</DropdownMenu.Label>
                                            <DropdownMenu.Separator />
                                            <DropdownMenu.Item onclick={() => selectedAssistantId = null}>
                                                Default
                                            </DropdownMenu.Item>
                                            {#each assistantsQuery.data ?? [] as assistant}
                                                <DropdownMenu.Item onclick={() => selectedAssistantId = assistant.id}>
                                                    {assistant.name}
                                                </DropdownMenu.Item>
                                            {/each}
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Root>
                                    <div class="flex items-center gap-1.5">
										<Tooltip>
											{#snippet trigger(tooltip)}
												<button
													type="button"
													class={cn(
														'bg-secondary/50 hover:bg-secondary text-muted-foreground relative flex size-8 items-center justify-center rounded-lg transition-colors',
														settings.webSearchMode === 'standard' && 'bg-primary/20 text-primary border-primary/50', settings.webSearchMode === 'deep' && 'bg-amber-500/20 text-amber-500 border-amber-500/50'
													)}
													onclick={() => {
														if (settings.webSearchMode === 'off') settings.webSearchMode = 'standard';
														else if (settings.webSearchMode === 'standard') settings.webSearchMode = 'deep';
														else settings.webSearchMode = 'off';
													}}
													{...tooltip.trigger}
												>
													<SearchIcon class="size-4" />
													{#if settings.webSearchMode === 'deep'}
														<span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500"></span>
													{/if}
												</button>
											{/snippet}
											{settings.webSearchMode === 'off' ? 'Web Search: Off' : settings.webSearchMode === 'standard' ? 'Web Search: Standard ($0.006)' : 'Web Search: Deep ($0.06)'}
										</Tooltip>
										{#if currentModelSupportsImages}
											<button
												type="button"
												class="bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
												onclick={() => fileInput?.click()}
												disabled={isUploading}
											>
												{#if isUploading}
													<div
														class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
													></div>
												{:else}
													<ImageIcon class="size-4" />
												{/if}
											</button>
										{/if}
										{#if currentModelSupportsReasoning}
											<button
												type="button"
												class={cn(
													'bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-8 items-center justify-center rounded-lg transition-colors',
													settings.reasoningEffort !== 'low' && 'bg-primary/20 text-primary border-primary/50'
												)}
												onclick={() => (settings.reasoningEffort = settings.reasoningEffort === 'low' ? 'medium' : 'low')}
											>
												<BrainIcon class="size-4" />
											</button>
										{/if}
									</div>
								</div>
								<div class="mb-0.5">
									<Tooltip placement="top">
										{#snippet trigger(tooltip)}
											<button
												type={isGenerating ? 'button' : 'submit'}
												onclick={isGenerating ? stopGeneration : undefined}
												disabled={isGenerating ? false : !message.current.trim()}
												class="bg-primary text-primary-foreground hover:opacity-90 active:scale-95 flex size-8 items-center justify-center rounded-lg shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100"
												{...tooltip.trigger}
											>
												{#if isGenerating}
													<StopIcon class="size-4" />
												{:else}
													<SendIcon class="size-4" />
												{/if}
											</button>
										{/snippet}
										{isGenerating ? 'Stop generation' : 'Send message'}
									</Tooltip>
								</div>
							</div>
						</div>
					</form>
				</div>
			</div>


		</div>
	</Sidebar.Inset>

	{#if fileUpload.isDragging && currentModelSupportsImages}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm">
			<div class="text-center">
				<UploadIcon class="text-primary mx-auto mb-4 h-16 w-16" />
				<p class="text-xl font-semibold">Add image</p>
				<p class="mt-2 text-sm opacity-75">Drop an image here to attach it to your message.</p>
			</div>
		</div>
	{/if}

	<ImageModal
		bind:open={imageModal.open}
		imageUrl={imageModal.imageUrl}
		fileName={imageModal.fileName}
	/>
</Sidebar.Root>

<SearchModal bind:open={searchModalOpen} />
