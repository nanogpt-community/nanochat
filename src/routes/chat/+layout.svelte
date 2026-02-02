<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte.js';
	import { extractUrlsByType } from '$lib/backend/url-scraper';
	import type { Doc, Id } from '$lib/db/types';
	import type { Assistant, Conversation, UserSettings, Message, UserRule } from '$lib/api';
	import { apiCall } from '$lib/api';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ImageModal } from '$lib/components/ui/image-modal';
	import { DocumentModal } from '$lib/components/ui/document-modal';
	import { ThemeToggle } from '$lib/components/ui/light-switch/index.js';
	import { ShareButton } from '$lib/components/ui/share-button';
	import { ExportButton } from '$lib/components/ui/export-button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	// import SettingsModal from '$lib/components/ui/settings-modal/settings-modal.svelte';
	import VideoGenerationModal from '$lib/components/video/video-generation-modal.svelte';
	import ImageGenerationModal from '$lib/components/image/image-generation-modal.svelte';
	import { videoGenerator } from '$lib/state/video-generator.svelte';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte.js';
	import { TextareaAutosize } from '$lib/spells/textarea-autosize.svelte.js';
	import { models } from '$lib/state/models.svelte';
	import { usePrompt } from '$lib/state/prompt.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { Provider } from '$lib/types';
	import { compressImage } from '$lib/utils/image-compression';
	import {
		supportsImages,
		supportsReasoning,
		supportsVerbosity,
		supportsDocuments,
		supportsVideo,
		isImageOnlyModel,
	} from '$lib/utils/model-capabilities';
	import { validateFiles, getFileType } from '$lib/utils/file-validation';
	import { omit, pick } from '$lib/utils/object.js';
	import { cn } from '$lib/utils/utils.js';
	import { mutate } from '$lib/client/mutation.svelte';
	import { FileUpload, Popover } from 'melt/builders';
	import { Debounced, ElementSize, IsMounted, PersistedState, ScrollState } from 'runed';
	import { fade, scale } from 'svelte/transition';
	import SendIcon from '~icons/lucide/arrow-up';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import PanelLeftIcon from '~icons/lucide/panel-left';
	import SearchIcon from '~icons/lucide/search';
	import Settings2Icon from '~icons/lucide/settings-2';
	import StopIcon from '~icons/lucide/square';
	import UploadIcon from '~icons/lucide/upload';
	import XIcon from '~icons/lucide/x';

	import PaperclipIcon from '~icons/lucide/paperclip';
	import MicIcon from '~icons/lucide/mic';
	import { audioRecorder } from '$lib/state/audio-recorder.svelte';
	import { callCancelGeneration } from '../api/cancel-generation/call.js';
	import { callGenerateMessage } from '../api/generate-message/call.js';
	import { ModelPicker } from '$lib/components/model-picker';
	import { ProviderPicker } from '$lib/components/provider-picker';
	import SearchModal from './search-modal.svelte';
	import { PromptPicker } from '$lib/components/ui/prompt-picker';
	import type { Prompt } from '$lib/api';
	import { shortcut, getKeybindOptions } from '$lib/actions/shortcut.svelte.js';
	import { mergeAttrs } from 'melt';
	import { callEnhancePrompt } from '../api/enhance-prompt/call.js';
	import ShinyText from '$lib/components/animations/shiny-text.svelte';
	import SparkleIcon from '~icons/lucide/sparkle';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import BrainIcon from '~icons/lucide/brain';
	import * as casing from '$lib/utils/casing.js';
	import BotIcon from '~icons/lucide/bot';
	import PlusIcon from '~icons/lucide/plus';
	import GhostIcon from '~icons/lucide/ghost';
	import EllipsisVerticalIcon from '~icons/lucide/ellipsis-vertical';
	import { isTemporaryConversation } from '$lib/state/temporary-chat.svelte';
	import VideoIcon from '~icons/lucide/video';
	import ImageIcon from '~icons/lucide/image';

	let { children } = $props();

	let textarea = $state<HTMLTextAreaElement>();
	let abortController = $state<AbortController | null>(null);

	// Get restrictions from page data (for server key users)
	const restrictions = $derived(page.data?.restrictions);

	$effect(() => {
		// Enable initial models for new users
		mutate(
			api.user_enabled_models.enable_initial.url,
			{
				action: 'enableInitial',
			},
			{
				invalidatePatterns: [api.user_enabled_models.get_enabled.url],
			}
		);

		// Cleanup temporary conversations from previous sessions
		fetch('/api/cleanup-temp-conversations', { method: 'POST' }).catch(() => {
			// Silently ignore cleanup errors
		});
	});

	const assistantsQuery = useCachedQuery<Assistant[]>(api.assistants.list, {
		session_token: session.current?.session.token ?? '',
	});

	const selectedAssistantId = new PersistedState<string>('selectedAssistantId', '');

	$effect(() => {
		if (selectedAssistantId.current === '' && assistantsQuery.data) {
			const defaultAssistant = assistantsQuery.data.find((a: any) => a.isDefault);
			if (defaultAssistant) {
				selectedAssistantId.current = defaultAssistant.id;
			} else if (assistantsQuery.data && assistantsQuery.data.length > 0) {
				selectedAssistantId.current = assistantsQuery.data[0]?.id ?? '';
			}
		}
	});

	const selectedAssistant = $derived(
		assistantsQuery.data?.find((a: any) => a.id === selectedAssistantId.current)
	);

	// Apply assistant defaults when switching assistants
	let previousAssistantId = $state<string | null>(selectedAssistantId.current);

	$effect(() => {
		const currentId = selectedAssistantId.current;
		const assistant = selectedAssistant;

		// Only apply defaults when actually switching to a different assistant
		if (currentId && currentId !== previousAssistantId && assistant) {
			previousAssistantId = currentId;

			// Apply model if configured (don't reset model if not configured)
			if (assistant.defaultModelId) {
				settings.modelId = assistant.defaultModelId;
			}

			// Apply search settings - reset to defaults if not configured
			settings.webSearchMode =
				(assistant.defaultWebSearchMode as 'off' | 'standard' | 'deep') || 'off';
			settings.webSearchProvider =
				(assistant.defaultWebSearchProvider as
					| 'linkup'
					| 'tavily'
					| 'exa'
					| 'kagi'
					| 'perplexity'
					| 'valyu') || 'linkup';
			settings.webSearchExaDepth =
				(assistant.defaultWebSearchExaDepth as 'fast' | 'auto' | 'neural' | 'deep') || 'auto';
			settings.webSearchContextSize =
				(assistant.defaultWebSearchContextSize as 'low' | 'medium' | 'high') || 'medium';
			settings.webSearchKagiSource =
				(assistant.defaultWebSearchKagiSource as 'web' | 'news' | 'search') || 'web';
			settings.webSearchValyuSearchType =
				(assistant.defaultWebSearchValyuSearchType as 'all' | 'web') || 'all';
		}
	});

	const currentConversationQuery = useCachedQuery<Conversation>(api.conversations.getById, () => ({
		id: page.params.id,
	}));

	const isGenerating = $derived(
		Boolean(currentConversationQuery.data?.generating) ||
			(page.params.id ? currentConversationQuery.isLoading : false)
	);

	// Track when generation completes to refresh sidebar for title updates
	let wasGeneratingInLayout = $state(false);
	let settingsModalOpen = $state(false);
	let videoModalOpen = $state(false);
	let videoParams = $state<Record<string, any>>({});
	let imageModalOpen = $state(false);
	let imageParams = $state<Record<string, any>>({});

	$effect(() => {
		if (isGenerating) {
			wasGeneratingInLayout = true;
		} else if (wasGeneratingInLayout) {
			wasGeneratingInLayout = false;
			// Title generation now happens while generating=true, so the existing
			// polling mechanism in app-sidebar.svelte will catch the update
			// No additional refreshes needed here
		}
	});

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
	let youtubeUrlDetected = $state(false);

	// Load settings for YouTube transcripts
	const userSettings = useCachedQuery<UserSettings>(api.user_settings.get, {});
	const themeToggleSettings = $derived({
		theme: userSettings.data?.theme,
		isLoading: userSettings.isLoading,
		error: userSettings.error,
	});
	const transcriptsEnabled = $derived(userSettings.data?.youtubeTranscriptsEnabled ?? false);
	const nanoGPTKeyQuery = useCachedQuery(api.user_keys.get, {
		provider: Provider.NanoGPT,
		session_token: session.current?.session.token ?? '',
	});
	const suggestedPromptsEnabled = $derived(userSettings.data?.suggestedPromptsEnabled ?? true);
	const centerPromptInput = $derived(
		page.url.pathname === '/chat' &&
			!page.params.id &&
			nanoGPTKeyQuery.data &&
			!nanoGPTKeyQuery.isLoading &&
			!suggestedPromptsEnabled
	);
	const promptDockClass = $derived(
		centerPromptInput
			? 'top-1/2 -translate-y-1/2 pb-2'
			: 'bottom-0 md:bottom-4 mt-auto pb-2 md:pb-0'
	);

	// Import messages API to check for YouTube URLs
	const messages = useCachedQuery<Message[]>(
		api.messages.getAllFromConversation,
		() => ({
			conversationId: page.params.id ?? '',
		}),
		{
			enabled: !!page.params.id,
		}
	);

	// Check for YouTube URLs in the last user message
	$effect(() => {
		if (messages.data) {
			const userMessages = messages.data.filter((m) => m.role === 'user');
			const lastUserMessage = userMessages[userMessages.length - 1];

			if (lastUserMessage) {
				const { youtubeUrls } = extractUrlsByType(lastUserMessage.content);
				youtubeUrlDetected = youtubeUrls.length > 0;
			} else {
				youtubeUrlDetected = false;
			}
		}
	});

	async function handleSubmit() {
		if (isGenerating && !currentModelSupportsVideo) return; // Allow submission if video gen is different mechanism? No, standard guard.

		error = null;

		// TODO: Re-use zod here from server endpoint for better error messages?
		if (message.current === '' || !session.current?.user.id || !settings.modelId) return;

		loading = true;

		if (currentModelSupportsVideo) {
			// Video Generation Flow
			const prompt = message.current;
			const currentModelId = settings.modelId;
			const cidParams = page.params.id;
			let conversationId = cidParams;

			try {
				// 1. Ensure conversation exists using create conversation API if needed,
				// OR use api.messages.create which might imply conversation? NO, need convo ID.
				if (!conversationId) {
					// Create new conversation
					const newConvo = await apiCall<{ id: string }>(api.conversations.create.url, {
						method: 'POST',
						body: { action: 'create', title: 'New Chat' }, // Let backend handle title generation later?
					});
					conversationId = newConvo.id;
					// Navigate to new conversation
					goto(`/chat/${conversationId}`);
				}

				message.current = ''; // Clear input immediately

				// 2. Create User Message
				await mutate(api.messages.create.url, {
					action: 'create',
					conversationId,
					role: 'user',
					content: prompt,
					modelId: currentModelId,
					provider: 'nanogpt',
				});

				// 3. Create Assistant Message (Placeholder)
				const assistantMsg = await mutate<{ id: string }>(api.messages.create.url, {
					action: 'create',
					conversationId,
					role: 'assistant',
					content: 'Generating video...',
					modelId: currentModelId,
					provider: 'nanogpt',
				});

				// 4. Trigger Video Generation
				// We use videoGenerator store but we need to hook into it or capture the runId/promise
				// The store handles global history, we want this specific generation.
				// call generation directly?
				// videoGenerator.generate returns nothing? We need to modify it or call endpoint directly.
				// Actually videoGenerator.generate calls /api/video/generate and polls.
				// We want to update OUR message when it changes.
				// We can start generation and let the store handle it, BUT updating the chat message is key.

				// Let's call the endpoint directly to get control + runId.
				const genRes = await fetch('/api/video/generate', {
					method: 'POST',
					body: JSON.stringify({
						model: currentModelId,
						prompt: prompt,
						...videoParams,
					}),
				});

				if (!genRes.ok) {
					throw new Error('Video generation failed to start');
				}

				const genData = await genRes.json();
				const runId = genData.runId;

				// Update assistant message with metadata
				// We can't easily update metadata via updateMessage (it supports content/tokenCount).
				// But we can update content to [Generating video... (ID: ...)] or similar?
				// Better: Start polling here locally.

				pollVideoStatus(runId, assistantMsg.id, currentModelId, conversationId);
			} catch (e) {
				console.error('Video gen flow error', e);
				error = 'Failed to start video generation';
				message.current = prompt; // Restore prompt
			} finally {
				loading = false;
				// Invalidate to show messages
				invalidateQueryPattern(api.messages.getAllFromConversation.url);
				invalidateQueryPattern(api.conversations.getById.url);
			}
			return;
		}

		const imagesCopy = [...selectedImages];
		const documentsCopy = [...selectedDocuments];
		selectedImages = [];
		selectedDocuments = [];

		try {
			const res = await callGenerateMessage({
				message: message.current,
				session_token: session.current?.session.token,
				conversation_id: page.params.id ?? undefined,
				model_id: settings.modelId,
				provider_id: settings.providerId || undefined,
				images: imagesCopy.length > 0 ? imagesCopy : undefined,
				documents: documentsCopy.length > 0 ? documentsCopy : undefined,
				web_search_mode: settings.webSearchMode,
				web_search_provider: settings.webSearchProvider,
				web_search_exa_depth:
					settings.webSearchProvider === 'exa' ? settings.webSearchExaDepth : undefined,
				web_search_context_size:
					settings.webSearchMode !== 'off' ? settings.webSearchContextSize : undefined,
				web_search_kagi_source:
					settings.webSearchProvider === 'kagi' ? settings.webSearchKagiSource : undefined,
				web_search_valyu_search_type:
					settings.webSearchProvider === 'valyu' ? settings.webSearchValyuSearchType : undefined,
				assistant_id: selectedAssistantId.current || undefined,
				project_id: page.url.searchParams.get('projectId') || undefined,
				reasoning_effort:
					currentModelSupportsReasoning && currentModelSupportsVerbosity
						? settings.reasoningEffort
						: undefined,
				temporary: settings.temporaryMode || undefined,
				image_params:
					currentModelSupportsImageGen && Object.keys(imageParams).length > 0
						? imageParams
						: undefined,
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

	async function pollVideoStatus(
		runId: string,
		messageId: string,
		modelId: string,
		conversationId: string
	) {
		console.log(
			'[pollVideoStatus] Starting poll for runId:',
			runId,
			'model:',
			modelId,
			'msgId:',
			messageId,
			'convId:',
			conversationId
		);
		const pollInterval = setInterval(async () => {
			try {
				const url = `/api/video/status?runId=${runId}&model=${modelId}`;
				console.log('[pollVideoStatus] Fetching:', url);
				const res = await fetch(url);
				console.log('[pollVideoStatus] Status:', res.status);
				if (res.ok) {
					const data = await res.json();
					console.log('[pollVideoStatus] Data:', data);
					// Extract payload from nested data if present (NanoGPT structure)
					const payload = data.data || data;

					// Normalize status to lowercase
					const status = (payload.status || '').toLowerCase();
					if (status === 'completed') {
						clearInterval(pollInterval);
						console.log('[pollVideoStatus] Completed');

						// Extract video URL (handle nested format)
						const videoUrl = payload.videoUrl || payload.output?.video?.url || payload.output?.url;

						if (videoUrl) {
							// Update message content with video URL
							await mutate(api.messages.create.url, {
								action: 'updateContent',
								messageId,
								content: `[Video Result](${videoUrl})`,
							});
							invalidateQueryPattern(api.messages.getAllFromConversation.url);

							// Generate conversation title
							try {
								await fetch('/api/generate-title', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ conversation_id: conversationId }),
								});
								invalidateQueryPattern(api.conversations.get.url);
								invalidateQueryPattern(api.conversations.getById.url);
							} catch (e) {
								console.error('[pollVideoStatus] Title generation failed:', e);
							}
						} else {
							console.error('[pollVideoStatus] Completed but no video URL found', payload);
						}
					} else if (status === 'failed') {
						clearInterval(pollInterval);
						await mutate(api.messages.create.url, {
							error: payload.error || 'Video generation failed',
						});
						invalidateQueryPattern(api.messages.getAllFromConversation.url);
					}
					// If processing/queued, continue polling
				} else {
					// 404 or other error (maybe transient)
					console.warn('Poll status non-ok', res.status);
					const txt = await res.text();
					console.warn('Poll status response:', txt);
					// Don't clear immediately unless persistent, but for now logic is simple.
				}
			} catch (e) {
				console.error('Polling error', e);
			}
		}, 5000);

		// Timeout after 10 mins?
		setTimeout(() => {
			console.log('[pollVideoStatus] Timed out');
			clearInterval(pollInterval);
		}, 600000);
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

	const rulesQuery = useCachedQuery<UserRule[]>(api.user_rules.all, {
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

	let hasAutoSubmitted = $state(false);

	// Auto-submit when URL query parameter is present (only once)
	$effect(() => {
		const urlQuery = page.url.searchParams.get('q');
		if (urlQuery && message.current && !isGenerating && mounted.current && !hasAutoSubmitted) {
			hasAutoSubmitted = true;
			// Small delay to ensure everything is ready
			setTimeout(() => {
				handleSubmit();
			}, 100);
		}
	});
	let selectedImages = $state<{ url: string; storage_id: string; fileName?: string }[]>([]);
	let selectedDocuments = $state<
		{
			url: string;
			storage_id: string;
			fileName?: string;
			fileType: 'pdf' | 'markdown' | 'text' | 'epub';
		}[]
	>([]);
	let isUploading = $state(false);
	let fileInput = $state<HTMLInputElement>();

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

	const currentModelSupportsDocuments = $derived.by(() => {
		// For now, always show document support for testing
		// TODO: Make this model-specific when models are properly configured
		return true;

		// Original logic (commented out for testing):
		// if (!settings.modelId) return false;
		// const nanoGPTModels = models.from(Provider.NanoGPT);
		// const currentModel = nanoGPTModels.find((m) => m.id === settings.modelId);
		// if (!currentModel) return false;
		// return supportsDocuments(currentModel);
	});

	const currentModelSupportsVideo = $derived.by(() => {
		if (!settings.modelId) return false;
		const nanoGPTModels = models.from(Provider.NanoGPT);
		const currentModel = nanoGPTModels.find((m) => m.id === settings.modelId);
		if (!currentModel) return false;
		return supportsVideo(currentModel);
	});

	const currentModelSupportsVerbosity = $derived.by(() => {
		if (!settings.modelId) return false;
		const nanoGPTModels = models.from(Provider.NanoGPT);
		const currentModel = nanoGPTModels.find((m) => m.id === settings.modelId);
		if (!currentModel) return false;
		return supportsVerbosity(currentModel);
	});

	const currentModelSupportsImageGen = $derived.by(() => {
		if (!settings.modelId) return false;
		const nanoGPTModels = models.from(Provider.NanoGPT);
		const currentModel = nanoGPTModels.find((m) => m.id === settings.modelId);
		if (!currentModel) return false;
		return isImageOnlyModel(currentModel);
	});

	// Helper to check if file is an image (by MIME type or extension)
	// Chrome Android often returns empty file.type for images from gallery
	const IMAGE_EXTENSIONS = [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
		'bmp',
		'svg',
		'heic',
		'heif',
		'avif',
	];
	const EXTENSION_TO_MIME: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		bmp: 'image/bmp',
		svg: 'image/svg+xml',
		heic: 'image/heic',
		heif: 'image/heif',
		avif: 'image/avif',
	};

	function isImageFile(f: File): boolean {
		if (f.type.startsWith('image/')) return true;
		// Fallback: check extension for Chrome Android where MIME type may be empty
		const ext = f.name.split('.').pop()?.toLowerCase();
		return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
	}

	function getImageMimeType(f: File): string {
		if (f.type) return f.type;
		// Derive MIME type from extension for Chrome Android
		const ext = f.name.split('.').pop()?.toLowerCase();
		return ext ? (EXTENSION_TO_MIME[ext] ?? 'image/jpeg') : 'image/jpeg';
	}

	async function handleFilesSelect(files: File[]) {
		if (!files.length || !session.current?.session.token) return;

		const imageFiles = files.filter(isImageFile);
		const documentFiles = files.filter((f) => !isImageFile(f));

		if (imageFiles.length > 0) {
			isUploading = true;
			const uploadedImages: { url: string; storage_id: string; fileName?: string }[] = [];
			try {
				for (const file of imageFiles) {
					const mimeType = getImageMimeType(file);
					const compressedFile = await compressImage(file, 1024 * 1024);
					const uploadResult = await fetch('/api/storage', {
						method: 'POST',
						headers: { 'Content-Type': mimeType },
						credentials: 'include',
						body: compressedFile,
					});
					if (!uploadResult.ok) throw new Error(`Upload failed: ${uploadResult.statusText}`);
					const { storageId, url } = await uploadResult.json();
					if (url) uploadedImages.push({ url, storage_id: storageId, fileName: file.name });
				}
				selectedImages = [...selectedImages, ...uploadedImages];
			} catch (error) {
				console.error('Image upload failed:', error);
			} finally {
				isUploading = false;
			}
		}

		if (documentFiles.length > 0) {
			isUploading = true;
			const uploadedDocuments: {
				url: string;
				storage_id: string;
				fileName?: string;
				fileType: 'pdf' | 'markdown' | 'text' | 'epub';
			}[] = [];
			try {
				const validation = validateFiles(documentFiles, ['pdf', 'markdown', 'text', 'epub']);
				if (validation.errors.length > 0) {
					console.error('File validation errors:', validation.errors);
					// TODO: Show user-friendly error messages
					return;
				}
				for (const file of validation.validFiles) {
					const fileType = getFileType(file) as 'pdf' | 'markdown' | 'text' | 'epub';
					const uploadResult = await fetch('/api/storage', {
						method: 'POST',
						headers: { 'Content-Type': file.type },
						credentials: 'include',
						body: file,
					});
					if (!uploadResult.ok) throw new Error(`Upload failed: ${uploadResult.statusText}`);
					const { storageId, url } = await uploadResult.json();
					if (url)
						uploadedDocuments.push({ url, storage_id: storageId, fileName: file.name, fileType });
				}
				selectedDocuments = [...selectedDocuments, ...uploadedDocuments];
			} catch (error) {
				console.error('Document upload failed:', error);
			} finally {
				isUploading = false;
			}
		}
	}

	// Handle paste events to support pasting images and documents
	function handlePaste(event: ClipboardEvent) {
		const clipboardData = event.clipboardData;
		if (!clipboardData) return;

		// Supported document MIME types
		const supportedDocTypes = ['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown'];

		const files: File[] = [];
		for (const item of clipboardData.items) {
			const file = item.getAsFile();
			if (!file) continue;

			// Check if it's an image
			if (item.type.startsWith('image/')) {
				files.push(file);
				continue;
			}

			// Check if it's a supported document type
			if (supportedDocTypes.includes(item.type)) {
				files.push(file);
				continue;
			}

			// Also check file extension for documents (some systems don't set MIME type correctly)
			const ext = file.name.split('.').pop()?.toLowerCase();
			if (ext && ['pdf', 'md', 'markdown', 'txt'].includes(ext)) {
				files.push(file);
			}
		}

		if (files.length > 0) {
			// Prevent default paste behavior for files
			event.preventDefault();
			handleFilesSelect(files);
		}
	}

	// Get combined file upload builder for images and documents
	const fileUpload = new FileUpload({
		multiple: true,
		accept: 'image/*,application/pdf,.pdf,.md,.markdown,.txt,application/epub+zip,.epub',
		maxSize: 20 * 1024 * 1024, // 20MB
	});

	// Handle file selection effects
	$effect(() => {
		if (fileUpload.selected.size > 0) {
			handleFilesSelect(Array.from(fileUpload.selected));
			fileUpload.clear();
		}
	});

	// Define builders manually to satisfy type checker if needed
	const fileSelect = fileUpload.input;

	// Image modal state
	let imageModal = $state<{
		open: boolean;
		imageUrl: string;
		fileName: string;
	}>({
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

	// Document preview modal state
	let documentModal = $state<{
		open: boolean;
		documentUrl: string;
		fileName: string;
		fileType: 'pdf' | 'markdown' | 'text' | 'epub';
		content: string;
	}>({
		open: false,
		documentUrl: '',
		fileName: '',
		fileType: 'text',
		content: '',
	});

	async function openDocumentModal(
		documentUrl: string,
		fileName: string,
		fileType: 'pdf' | 'markdown' | 'text' | 'epub'
	) {
		let content = '';

		// For text and markdown files, fetch the content
		if (fileType === 'markdown' || fileType === 'text') {
			try {
				const response = await fetch(documentUrl);
				if (response.ok) {
					content = await response.text();
				}
			} catch (error) {
				console.error('Failed to fetch document content:', error);
				content = 'Failed to load document content.';
			}
		}

		documentModal = {
			open: true,
			documentUrl,
			fileName,
			fileType,
			content,
		};
	}

	function removeImage(index: number) {
		selectedImages = selectedImages.filter((_, i) => i !== index);
	}

	function removeDocument(index: number) {
		selectedDocuments = selectedDocuments.filter((_, i) => i !== index);
	}

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
	let promptPickerOpen = $state(false);

	function openSearchModal() {
		searchModalOpen = true;
	}

	function handlePromptApply(content: string, prompt: Prompt) {
		// Apply the prompt content based on the append mode
		if (prompt.appendMode === 'prepend') {
			message.current = content + (message.current ? '\n' + message.current : '');
		} else if (prompt.appendMode === 'append') {
			message.current = (message.current ? message.current + '\n' : '') + content;
		} else {
			// Default: replace
			message.current = content;
		}

		// Apply default settings if configured
		if (prompt.defaultModelId) {
			settings.modelId = prompt.defaultModelId;
		}
		if (prompt.defaultWebSearchMode) {
			settings.webSearchMode = prompt.defaultWebSearchMode as 'off' | 'standard' | 'deep';
		}
		if (prompt.defaultWebSearchProvider) {
			settings.webSearchProvider = prompt.defaultWebSearchProvider as
				| 'linkup'
				| 'tavily'
				| 'exa'
				| 'kagi'
				| 'perplexity'
				| 'valyu';
		}

		// Focus the textarea
		textarea?.focus();
	}

	let sidebarOpen = $state(false);

	async function toggleRecording() {
		if (audioRecorder.isRecording) {
			console.log('[toggleRecording] Stopping recording...');
			const text = await audioRecorder.stop();
			console.log('[toggleRecording] Received transcript:', text);
			console.log('[toggleRecording] Transcript type:', typeof text);
			console.log('[toggleRecording] Current message before:', message.current);
			if (text) {
				message.current += (message.current ? ' ' : '') + text;
				console.log('[toggleRecording] Current message after:', message.current);
				// Manually update textarea value to ensure UI updates
				if (textarea) {
					textarea.value = message.current;
					// Dispatch input event to trigger autosize and other listeners
					const event = new Event('input', { bubbles: true });
					textarea.dispatchEvent(event);
					textarea.focus();
				}
			} else {
				console.log('[toggleRecording] No transcript received, text is falsy');
			}
		} else {
			console.log('[toggleRecording] Starting recording...');
			await audioRecorder.start();
		}
	}
</script>

<svelte:head>
	<title>Chat | nanochat</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<svelte:window
	use:shortcut={getKeybindOptions('scrollToBottom', () => scrollState.scrollToBottom())}
/>

<Sidebar.Root
	bind:open={sidebarOpen}
	class="bg-sidebar fill-device-height overflow-clip"
	{...currentModelSupportsImages || currentModelSupportsDocuments
		? omit(fileUpload.dropzone, ['onclick'])
		: {}}
>
	<AppSidebar bind:searchModalOpen />

	<Sidebar.Inset
		class="bg-background md:border-border relative flex min-h-svh flex-1 flex-col overflow-clip transition-all duration-300 ease-in-out md:m-2 md:rounded-2xl md:border"
	>
		{#if !sidebarOpen}
			<!-- header - top left -->
			<div
				class={cn(
					'bg-sidebar/50 fixed top-4 left-4 z-50 flex w-fit rounded-lg p-1 backdrop-blur-lg transition-all duration-300 ease-in-out',
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
		<!-- header - top right -->
		<div
			class={cn('bg-sidebar/50 fixed top-4 right-4 z-50 flex rounded-lg p-1 backdrop-blur-lg', {
				'hidden md:flex': sidebarOpen,
			})}
		>
			<div class="hidden items-center gap-1 md:flex">
				{#if page.params.id && currentConversationQuery.data}
					<ExportButton
						conversationId={page.params.id}
						messages={messages.data}
						conversation={currentConversationQuery.data}
					/>
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
				<ThemeToggle variant="ghost" class="size-8" settings={themeToggleSettings} />
			</div>

			<div class="flex items-center md:hidden">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="hover:bg-secondary/80 flex size-8 items-center justify-center rounded-lg transition-colors"
					>
						<EllipsisVerticalIcon class="size-5" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						{#if page.params.id && currentConversationQuery.data}
							<div class="flex flex-col gap-1 p-1">
								<ExportButton
									conversationId={page.params.id}
									messages={messages.data}
									conversation={currentConversationQuery.data}
								/>
								<ShareButton conversationId={page.params.id as Id<'conversations'>} />
							</div>
							<DropdownMenu.Separator />
						{/if}
						<DropdownMenu.Item onclick={openSearchModal}>
							<SearchIcon class="mr-2 size-4" />
							<span>Search</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => goto('/account')}>
							<Settings2Icon class="mr-2 size-4" />
							<span>Settings</span>
						</DropdownMenu.Item>
						<ThemeToggle
							label="Theme"
							wrapperClass="flex items-center justify-between px-2 py-1.5 text-sm"
							variant="ghost"
							class="size-6"
							settings={themeToggleSettings}
						/>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
		<div class="relative">
			<div bind:this={conversationList} class="fill-device-height overflow-y-auto">
				<div
					class={cn('mx-auto flex max-w-3xl flex-col px-2 md:px-0', {
						'pt-12 md:pt-10': page.url.pathname !== '/chat',
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
								'text-muted-foreground !border-border absolute bottom-0 left-1/2 z-10 -translate-x-1/2 rounded-full !border text-xs transition-all duration-300 ease-out md:!pl-3',
								notAtBottom.current
									? 'translate-y-0 opacity-100'
									: 'pointer-events-none translate-y-2 scale-95 opacity-0',
							]}
							{...mergeAttrs(tooltip.trigger, {
								style: `bottom: ${wrapperSize.height + 10}px;`,
							})}
						>
							<span class="hidden md:inline">Scroll to bottom</span>
							<ChevronDownIcon class="inline" />
						</Button>
					{/snippet}
					{cmdOrCtrl} + D
				</Tooltip>
			</div>

			<div
				class={cn(
					'group safe-area-pb absolute right-0 left-0 mx-auto flex w-full max-w-3xl flex-col gap-1 px-2 md:px-4',
					promptDockClass
				)}
				bind:this={textareaWrapper}
			>
				{#if settings.temporaryMode}
					<div
						class="mb-2 flex items-center justify-center gap-2 rounded-lg bg-orange-500/20 px-3 py-1.5 text-sm text-orange-500"
					>
						<GhostIcon class="size-4" />
						<span>Temporary Mode — Messages won't be saved</span>
					</div>
				{/if}
				<div
					class="bg-secondary/40 border-border rounded-2xl border p-3 shadow-2xl backdrop-blur-xl"
				>
					<form
						class="relative flex w-full flex-col items-stretch gap-2 transition-all duration-300 ease-in-out"
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
						{#if youtubeUrlDetected && !transcriptsEnabled}
							<div
								in:fade={{ duration: 150 }}
								class="bg-background absolute top-0 left-0 {error
									? '-translate-y-20'
									: '-translate-y-12'} rounded-lg"
							>
								<div class="rounded-lg bg-yellow-500/50 px-3 py-1 text-sm text-yellow-100">
									YouTube transcripts are disabled. Enable in Settings to include video content.
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
							{#if selectedImages.length > 0 || selectedDocuments.length > 0}
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
												class="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 cursor-pointer rounded-full p-1 opacity-0 shadow-sm transition group-hover:opacity-100"
											>
												<XIcon class="h-3 w-3" />
											</button>
										</div>
									{/each}
									{#each selectedDocuments as document, index (document.storage_id)}
										<div
											class="group border-border bg-muted relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border p-1 transition-all"
										>
											<button
												type="button"
												onclick={() =>
													openDocumentModal(
														document.url,
														document.fileName || 'document',
														document.fileType
													)}
												class="bg-secondary/50 flex size-full flex-col items-center justify-center rounded-lg transition-opacity hover:opacity-80"
											>
												{#if document.fileType === 'pdf'}
													<span class="text-2xl">📄</span>
												{:else if document.fileType === 'markdown'}
													<span class="text-2xl">📝</span>
												{:else if document.fileType === 'text'}
													<span class="text-2xl">📄</span>
												{:else if document.fileType === 'epub'}
													<span class="text-2xl">📚</span>
												{/if}
											</button>
											<button
												type="button"
												onclick={() => removeDocument(index)}
												class="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 cursor-pointer rounded-full p-1 opacity-0 shadow-sm transition group-hover:opacity-100"
											>
												<XIcon class="h-3 w-3" />
											</button>
										</div>
									{/each}
								</div>
							{/if}
							<div class="relative flex flex-grow flex-row items-start">
								<input
									{...fileUpload.input}
									bind:this={fileInput}
									oninput={(e) => {
										// Fallback for Chrome Mobile Android where onchange may not fire for images
										const input = e.currentTarget as HTMLInputElement;
										if (input.files && input.files.length > 0) {
											handleFilesSelect(Array.from(input.files));
											input.value = ''; // Clear to allow re-selection of same file
										}
									}}
								/>
								<!-- svelte-ignore a11y_autofocus -->
								<textarea
									style={popover.trigger.style}
									onfocusout={popover.trigger.onfocusout}
									onfocus={popover.trigger.onfocus}
									bind:this={textarea}
									disabled={textareaDisabled}
									class="text-foreground placeholder:text-muted-foreground/40 max-h-64 min-h-[48px] w-full resize-none !overflow-y-auto bg-transparent px-4 py-3 text-base leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[56px]"
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
									onpaste={handlePaste}
									autofocus
									autocomplete="off"
									use:autosize.attachment
								></textarea>
							</div>
							<div class="mt-1 flex w-full items-center justify-between gap-2 px-2 pb-2 md:pb-1">
								<!-- Left side: Model picker + action buttons -->
								<div class="flex items-center gap-1.5">
									<ModelPicker
										class="bg-secondary/50 hover:bg-secondary text-muted-foreground flex h-9 items-center justify-center rounded-lg px-2.5 transition-colors"
										onlyImageModels={selectedImages.length > 0}
									/>
									<!-- Desktop only: Provider picker -->
									<ProviderPicker
										class="bg-secondary/50 hover:bg-secondary text-muted-foreground hidden h-9 items-center justify-center rounded-lg px-1.5 transition-colors md:flex"
										modelId={settings.modelId}
									/>
									<!-- Desktop only: Assistant picker -->
									{#if assistantsQuery.data && assistantsQuery.data.length > 0}
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												class="bg-secondary/50 hover:bg-secondary text-muted-foreground hidden h-9 items-center justify-center gap-2 rounded-lg px-2.5 transition-colors md:flex"
											>
												<BotIcon class="size-4" />
												<span class="max-w-[100px] truncate text-sm"
													>{selectedAssistant?.name ?? 'Assistant'}</span
												>
											</DropdownMenu.Trigger>
											<DropdownMenu.Content>
												<DropdownMenu.Group>
													<DropdownMenu.Label>Assistant</DropdownMenu.Label>
													<DropdownMenu.Separator />
													{#each assistantsQuery.data as assistant (assistant.id)}
														<DropdownMenu.CheckboxItem
															checked={selectedAssistantId.current === assistant.id}
															onclick={() => (selectedAssistantId.current = assistant.id)}
														>
															{assistant.name}
														</DropdownMenu.CheckboxItem>
													{/each}
												</DropdownMenu.Group>
												<DropdownMenu.Separator />
												<DropdownMenu.Item onclick={() => goto('/account/assistants?create=true')}>
													<PlusIcon class="mr-2 size-4" />
													Create new
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									{/if}
									<!-- Desktop: All action buttons inline -->
									<div class="hidden items-center gap-1.5 md:flex">
										{#if !restrictions?.webDisabled}
											<DropdownMenu.Root>
												<DropdownMenu.Trigger
													class={cn(
														'bg-secondary/50 hover:bg-secondary text-muted-foreground relative flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors',
														settings.webSearchMode === 'standard' && 'bg-primary/20 text-primary',
														settings.webSearchMode === 'deep' && 'bg-amber-500/20 text-amber-500'
													)}
												>
													<SearchIcon class="size-4" />
													<span class="text-xs font-medium">
														{settings.webSearchMode === 'off'
															? 'Off'
															: settings.webSearchMode === 'standard'
																? 'On'
																: 'Deep'}
													</span>
													<ChevronDownIcon class="size-3 opacity-50" />
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="start" class="w-56">
													<DropdownMenu.Label>Search Mode</DropdownMenu.Label>
													<DropdownMenu.RadioGroup bind:value={settings.webSearchMode}>
														<DropdownMenu.RadioItem value="off">Off</DropdownMenu.RadioItem>
														<DropdownMenu.RadioItem value="standard">
															Standard <span class="text-muted-foreground ml-auto text-xs"
																>$0.006</span
															>
														</DropdownMenu.RadioItem>
														<DropdownMenu.RadioItem value="deep">
															Deep <span class="text-muted-foreground ml-auto text-xs">$0.06</span>
														</DropdownMenu.RadioItem>
													</DropdownMenu.RadioGroup>

													{#if settings.webSearchMode !== 'off'}
														<DropdownMenu.Separator />
														<DropdownMenu.Label>Provider</DropdownMenu.Label>
														<DropdownMenu.RadioGroup bind:value={settings.webSearchProvider}>
															<DropdownMenu.RadioItem value="linkup">Linkup</DropdownMenu.RadioItem>
															<DropdownMenu.RadioItem value="tavily">Tavily</DropdownMenu.RadioItem>
															<DropdownMenu.RadioItem value="exa">Exa</DropdownMenu.RadioItem>
															<DropdownMenu.RadioItem value="kagi">Kagi</DropdownMenu.RadioItem>
															<DropdownMenu.RadioItem value="perplexity"
																>Perplexity</DropdownMenu.RadioItem
															>
															<DropdownMenu.RadioItem value="valyu">Valyu</DropdownMenu.RadioItem>
														</DropdownMenu.RadioGroup>

														{#if settings.webSearchProvider === 'exa'}
															<DropdownMenu.Separator />
															<DropdownMenu.Label>Exa Depth</DropdownMenu.Label>
															<DropdownMenu.RadioGroup bind:value={settings.webSearchExaDepth}>
																<DropdownMenu.RadioItem value="fast">Fast</DropdownMenu.RadioItem>
																<DropdownMenu.RadioItem value="auto">Auto</DropdownMenu.RadioItem>
																<DropdownMenu.RadioItem value="neural"
																	>Neural</DropdownMenu.RadioItem
																>
																<DropdownMenu.RadioItem value="deep">Deep</DropdownMenu.RadioItem>
															</DropdownMenu.RadioGroup>
														{/if}

														{#if settings.webSearchProvider === 'kagi'}
															<DropdownMenu.Separator />
															<DropdownMenu.Label>Kagi Source</DropdownMenu.Label>
															<DropdownMenu.RadioGroup bind:value={settings.webSearchKagiSource}>
																<DropdownMenu.RadioItem value="web">Web</DropdownMenu.RadioItem>
																<DropdownMenu.RadioItem value="news">News</DropdownMenu.RadioItem>
																<DropdownMenu.RadioItem value="search"
																	>Search</DropdownMenu.RadioItem
																>
															</DropdownMenu.RadioGroup>
														{/if}

														{#if settings.webSearchProvider === 'valyu'}
															<DropdownMenu.Separator />
															<DropdownMenu.Label>Valyu Search Type</DropdownMenu.Label>
															<DropdownMenu.RadioGroup
																bind:value={settings.webSearchValyuSearchType}
															>
																<DropdownMenu.RadioItem value="all"
																	>All Sources</DropdownMenu.RadioItem
																>
																<DropdownMenu.RadioItem value="web">Web Only</DropdownMenu.RadioItem
																>
															</DropdownMenu.RadioGroup>
														{/if}

														<DropdownMenu.Separator />
														<DropdownMenu.Label>Context Size</DropdownMenu.Label>
														<DropdownMenu.RadioGroup bind:value={settings.webSearchContextSize}>
															<DropdownMenu.RadioItem value="low">Low</DropdownMenu.RadioItem>
															<DropdownMenu.RadioItem value="medium">Medium</DropdownMenu.RadioItem>
															<DropdownMenu.RadioItem value="high">High</DropdownMenu.RadioItem>
														</DropdownMenu.RadioGroup>
													{/if}
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										{/if}
										{#if currentModelSupportsImages || currentModelSupportsDocuments}
											<Tooltip>
												{#snippet trigger(tooltip)}
													<button
														type="button"
														class="bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
														onclick={() => fileInput?.click()}
														disabled={isUploading}
														{...tooltip.trigger}
													>
														{#if isUploading}
															<div
																class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
															></div>
														{:else}
															<PaperclipIcon class="size-4" />
														{/if}
													</button>
												{/snippet}
												Attach files (images, PDF, Markdown, Text, EPUB)
											</Tooltip>
										{/if}
										{#if currentModelSupportsReasoning && currentModelSupportsVerbosity}
											<Tooltip>
												{#snippet trigger(tooltip)}
													<button
														type="button"
														class={cn(
															'bg-secondary/50 hover:bg-secondary text-muted-foreground relative flex size-8 items-center justify-center rounded-lg transition-colors',
															settings.reasoningEffort === 'medium' && 'bg-primary/20 text-primary',
															settings.reasoningEffort === 'high' &&
																'bg-amber-500/20 text-amber-500'
														)}
														onclick={() => {
															if (settings.reasoningEffort === 'low')
																settings.reasoningEffort = 'medium';
															else if (settings.reasoningEffort === 'medium')
																settings.reasoningEffort = 'high';
															else settings.reasoningEffort = 'low';
														}}
														{...tooltip.trigger}
													>
														<BrainIcon class="size-4" />
														{#if settings.reasoningEffort === 'high'}
															<span
																class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500"
															></span>
														{/if}
													</button>
												{/snippet}
												{settings.reasoningEffort === 'low'
													? 'Extended Thinking: Off — Click to enable step-by-step reasoning'
													: settings.reasoningEffort === 'medium'
														? 'Extended Thinking: Medium — AI reasons before responding (uses more tokens)'
														: 'Extended Thinking: High — Deep reasoning for complex problems (uses most tokens)'}
											</Tooltip>
										{/if}
										<Tooltip>
											{#snippet trigger(tooltip)}
												<button
													type="button"
													class={cn(
														'bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-8 items-center justify-center rounded-lg transition-colors',
														(audioRecorder.isRecording || audioRecorder.isProcessing) &&
															'animate-pulse bg-red-500/20 text-red-500'
													)}
													onclick={toggleRecording}
													{...tooltip.trigger}
												>
													{#if audioRecorder.isProcessing}
														<div
															class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
														></div>
													{:else if audioRecorder.isRecording}
														<StopIcon class="size-4" />
													{:else}
														<MicIcon class="size-4" />
													{/if}
												</button>
											{/snippet}
											{audioRecorder.isRecording ? 'Stop Recording' : 'Voice Input'}
										</Tooltip>
										<!-- More Options dropdown for less-used features -->
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												class={cn(
													'bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-8 items-center justify-center rounded-lg transition-colors',
													(settings.temporaryMode ||
														(currentModelSupportsVideo && Object.keys(videoParams).length > 0) ||
														(currentModelSupportsImageGen &&
															Object.keys(imageParams).length > 0)) &&
														'bg-primary/20 text-primary'
												)}
											>
												<EllipsisVerticalIcon class="size-4" />
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end">
												<DropdownMenu.Item
													onclick={() => (settings.temporaryMode = !settings.temporaryMode)}
												>
													<GhostIcon
														class={cn('mr-2 size-4', settings.temporaryMode && 'text-orange-500')}
													/>
													Temporary Mode: {settings.temporaryMode ? 'On' : 'Off'}
												</DropdownMenu.Item>
												{#if currentModelSupportsVideo}
													<DropdownMenu.Item onclick={() => (videoModalOpen = true)}>
														<VideoIcon
															class={cn(
																'mr-2 size-4',
																Object.keys(videoParams).length > 0 && 'text-blue-500'
															)}
														/>
														Video Settings
														{#if Object.keys(videoParams).length > 0}
															<span class="ml-auto text-xs text-blue-500">•</span>
														{/if}
													</DropdownMenu.Item>
												{/if}
												{#if currentModelSupportsImageGen}
													<DropdownMenu.Item onclick={() => (imageModalOpen = true)}>
														<ImageIcon
															class={cn(
																'mr-2 size-4',
																Object.keys(imageParams).length > 0 && 'text-purple-500'
															)}
														/>
														Image Settings
														{#if Object.keys(imageParams).length > 0}
															<span class="ml-auto text-xs text-purple-500">•</span>
														{/if}
													</DropdownMenu.Item>
												{/if}
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</div>
									<!-- Mobile: Essential buttons only -->
									<div class="flex items-center gap-1 md:hidden">
										{#if currentModelSupportsImages || currentModelSupportsDocuments}
											<button
												type="button"
												class="bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-9 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
												onclick={() => fileInput?.click()}
												disabled={isUploading}
											>
												{#if isUploading}
													<div
														class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
													></div>
												{:else}
													<PaperclipIcon class="size-4" />
												{/if}
											</button>
										{/if}
										<button
											type="button"
											class={cn(
												'bg-secondary/50 hover:bg-secondary text-muted-foreground flex size-9 items-center justify-center rounded-lg transition-colors',
												(audioRecorder.isRecording || audioRecorder.isProcessing) &&
													'animate-pulse bg-red-500/20 text-red-500'
											)}
											onclick={toggleRecording}
										>
											{#if audioRecorder.isProcessing}
												<div
													class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
												></div>
											{:else if audioRecorder.isRecording}
												<StopIcon class="size-4" />
											{:else}
												<MicIcon class="size-4" />
											{/if}
										</button>
										<!-- Mobile More menu -->
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												class={cn(
													'bg-secondary/50 hover:bg-secondary text-muted-foreground relative flex size-9 items-center justify-center rounded-lg transition-colors',
													(settings.webSearchMode !== 'off' ||
														(currentModelSupportsReasoning &&
															currentModelSupportsVerbosity &&
															settings.reasoningEffort !== 'low') ||
														settings.temporaryMode) &&
														'bg-primary/20 text-primary'
												)}
											>
												<EllipsisVerticalIcon class="size-4" />
												{#if settings.webSearchMode !== 'off' || (currentModelSupportsReasoning && currentModelSupportsVerbosity && settings.reasoningEffort !== 'low') || settings.temporaryMode}
													<span class="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full"
													></span>
												{/if}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end">
												{#if assistantsQuery.data && assistantsQuery.data.length > 0}
													<DropdownMenu.Sub>
														<DropdownMenu.SubTrigger>
															<BotIcon class="mr-2 size-4" />
															{selectedAssistant?.name ?? 'Assistant'}
														</DropdownMenu.SubTrigger>
														<DropdownMenu.SubContent>
															{#each assistantsQuery.data as assistant (assistant.id)}
																<DropdownMenu.CheckboxItem
																	checked={selectedAssistantId.current === assistant.id}
																	onclick={() => (selectedAssistantId.current = assistant.id)}
																>
																	{assistant.name}
																</DropdownMenu.CheckboxItem>
															{/each}
														</DropdownMenu.SubContent>
													</DropdownMenu.Sub>
													<DropdownMenu.Separator />
												{/if}
												{#if !restrictions?.webDisabled}
													<DropdownMenu.Item
														onclick={() => {
															if (settings.webSearchMode === 'off')
																settings.webSearchMode = 'standard';
															else if (settings.webSearchMode === 'standard')
																settings.webSearchMode = 'deep';
															else settings.webSearchMode = 'off';
														}}
													>
														<SearchIcon
															class={cn('mr-2 size-4', {
																'text-primary': settings.webSearchMode === 'standard',
																'text-amber-500': settings.webSearchMode === 'deep',
															})}
														/>
														Web Search: {settings.webSearchMode === 'off'
															? 'Off'
															: settings.webSearchMode === 'standard'
																? 'Standard'
																: 'Deep'}
													</DropdownMenu.Item>
												{/if}
												{#if currentModelSupportsReasoning && currentModelSupportsVerbosity}
													<DropdownMenu.Item
														onclick={() => {
															if (settings.reasoningEffort === 'low')
																settings.reasoningEffort = 'medium';
															else if (settings.reasoningEffort === 'medium')
																settings.reasoningEffort = 'high';
															else settings.reasoningEffort = 'low';
														}}
													>
														<BrainIcon
															class={cn('mr-2 size-4', {
																'text-primary': settings.reasoningEffort === 'medium',
																'text-amber-500': settings.reasoningEffort === 'high',
															})}
														/>
														Thinking: {settings.reasoningEffort === 'low'
															? 'Off'
															: settings.reasoningEffort === 'medium'
																? 'Medium'
																: 'High'}
													</DropdownMenu.Item>
												{/if}
												<DropdownMenu.Item
													onclick={() => (settings.temporaryMode = !settings.temporaryMode)}
												>
													<GhostIcon
														class={cn('mr-2 size-4', settings.temporaryMode && 'text-orange-500')}
													/>
													Temporary: {settings.temporaryMode ? 'On' : 'Off'}
												</DropdownMenu.Item>
												{#if currentModelSupportsVideo}
													<DropdownMenu.Separator />
													<DropdownMenu.Item onclick={() => (videoModalOpen = true)}>
														<VideoIcon
															class={cn(
																'mr-2 size-4',
																Object.keys(videoParams).length > 0 && 'text-blue-500'
															)}
														/>
														Video Settings
														{#if Object.keys(videoParams).length > 0}
															<span class="ml-auto text-xs text-blue-500">•</span>
														{/if}
													</DropdownMenu.Item>
												{/if}
												{#if currentModelSupportsImageGen}
													<DropdownMenu.Separator />
													<DropdownMenu.Item onclick={() => (imageModalOpen = true)}>
														<ImageIcon
															class={cn(
																'mr-2 size-4',
																Object.keys(imageParams).length > 0 && 'text-purple-500'
															)}
														/>
														Image Settings
														{#if Object.keys(imageParams).length > 0}
															<span class="ml-auto text-xs text-purple-500">•</span>
														{/if}
													</DropdownMenu.Item>
												{/if}
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</div>
								</div>
								<!-- Right side: Send button -->
								<button
									type={isGenerating ? 'button' : 'submit'}
									onclick={isGenerating ? stopGeneration : undefined}
									disabled={isGenerating ? false : !message.current.trim()}
									class="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full shadow-lg transition-all hover:opacity-90 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50 md:size-8 md:rounded-lg"
								>
									{#if isGenerating}
										<StopIcon class="size-4" />
									{:else}
										<SendIcon class="size-4" />
									{/if}
								</button>
							</div>
						</div>
					</form>
				</div>
			</div>
		</div>
	</Sidebar.Inset>

	{#if fileUpload.isDragging && (currentModelSupportsImages || currentModelSupportsDocuments)}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm">
			<div class="text-center">
				<UploadIcon class="text-primary mx-auto mb-4 h-16 w-16" />
				<p class="text-xl font-semibold">Add files</p>
				<p class="mt-2 text-sm opacity-75">
					Drop images or documents (PDF, Markdown, Text) here to attach them to your message.
				</p>
			</div>
		</div>
	{/if}

	<ImageModal
		bind:open={imageModal.open}
		imageUrl={imageModal.imageUrl}
		fileName={imageModal.fileName}
	/>

	<DocumentModal
		bind:open={documentModal.open}
		documentUrl={documentModal.documentUrl}
		fileName={documentModal.fileName}
		fileType={documentModal.fileType}
		content={documentModal.content}
	/>
</Sidebar.Root>

<SearchModal bind:open={searchModalOpen} />
<PromptPicker bind:open={promptPickerOpen} onApply={handlePromptApply} />
<!-- <SettingsModal bind:open={settingsModalOpen} /> -->
<VideoGenerationModal
	bind:open={videoModalOpen}
	presetModelId={settings.modelId}
	bind:videoParams
/>
<ImageGenerationModal
	bind:open={imageModalOpen}
	presetModelId={settings.modelId}
	bind:imageParams
/>
