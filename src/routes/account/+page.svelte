<script lang="ts">
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { goto } from '$app/navigation';
	import { ResultAsync } from 'neverthrow';
	import { mutate } from '$lib/client/mutation.svelte';
	import type { UserSettings } from '$lib/api';
	import type { UserMemory } from '$lib/db/schema';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import PasskeySettings from '$lib/components/account/PasskeySettings.svelte';
	import { callModal } from '$lib/components/ui/modal/global-modal.svelte';
	import Trash2 from '~icons/lucide/trash-2';
	import FolderX from '~icons/lucide/folder-x';
	import EyeOffIcon from '~icons/lucide/eye-off';
	import BrainIcon from '~icons/lucide/brain';
	import Volume2Icon from '~icons/lucide/volume-2';
	import PlugIcon from '~icons/lucide/plug';
	import ShieldIcon from '~icons/lucide/shield';
	import DatabaseIcon from '~icons/lucide/database';
	import CheckIcon from '~icons/lucide/check';
	import AlertTriangleIcon from '~icons/lucide/alert-triangle';
	import { models } from '$lib/state/models.svelte';
	import { settings as localSettings } from '$lib/state/settings.svelte';
	import { Provider } from '$lib/types.js';
	import { cn } from '$lib/utils/utils';

	let { data } = $props();
	const settings = useCachedQuery<UserSettings>(api.user_settings.get, {});

	let privacyMode = $derived(settings.data?.privacyMode ?? false);
	let autoCompactEnabled = $derived(settings.data?.autoCompactEnabled ?? true);
	let autoCompactThreshold = $state(80);
	let memoryModelId = $state(settings.data?.memoryModelId ?? '');
	let memoryProviderId = $state(settings.data?.memoryProviderId ?? '');
	let memoryModelProviders = $state<ProviderInfo[]>([]);
	let memorySupportsProviderSelection = $state(false);
	const memories = useCachedQuery<UserMemory[]>(api.user_memories.list, {});
	const memoryInvalidate = { invalidatePatterns: [api.user_memories.list.url] };
	let newMemory = $state('');
	let editingMemoryId = $state<string | null>(null);
	let editingMemoryText = $state('');
	let persistentMemoryEnabled = $derived(settings.data?.persistentMemoryEnabled ?? false);
	let youtubeTranscriptsEnabled = $derived(settings.data?.youtubeTranscriptsEnabled ?? false);
	let webScrapingEnabled = $derived(settings.data?.webScrapingEnabled ?? false);
	let mcpEnabled = $derived(settings.data?.mcpEnabled ?? false);
	let followUpQuestionsEnabled = $derived(settings.data?.followUpQuestionsEnabled ?? true);
	let suggestedPromptsEnabled = $derived(settings.data?.suggestedPromptsEnabled ?? true);
	let titleModelId = $state(settings.data?.titleModelId ?? '');
	let titleProviderId = $state(settings.data?.titleProviderId ?? '');
	let followUpModelId = $state(settings.data?.followUpModelId ?? '');
	let followUpProviderId = $state(settings.data?.followUpProviderId ?? '');
	let timezone = $state(settings.data?.timezone ?? '');
	let timezoneSaving = $state(false);
	const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
	const intlWithSupported = Intl as typeof Intl & {
		supportedValuesOf?: (key: string) => string[];
	};
	const timezoneOptions = $derived(
		typeof intlWithSupported.supportedValuesOf === 'function'
			? intlWithSupported.supportedValuesOf('timeZone')
			: Array.from(new Set([browserTimezone, 'UTC']))
	);

	$effect(() => {
		if (settings.data?.titleModelId) titleModelId = settings.data.titleModelId;
		if (settings.data?.titleProviderId) titleProviderId = settings.data.titleProviderId;
		if (settings.data?.followUpModelId) followUpModelId = settings.data.followUpModelId;
		if (settings.data?.followUpProviderId) followUpProviderId = settings.data.followUpProviderId;
		if (settings.data?.memoryModelId) memoryModelId = settings.data.memoryModelId;
		if (settings.data?.memoryProviderId) memoryProviderId = settings.data.memoryProviderId;
		if (settings.data?.autoCompactThreshold) autoCompactThreshold = settings.data.autoCompactThreshold;
		if (settings.data?.timezone) timezone = settings.data.timezone;
	});

	type ProviderInfo = {
		provider: string;
		pricing: {
			inputPer1kTokens: number;
			outputPer1kTokens: number;
		};
		available: boolean;
	};

	type ModelProvidersResponse = {
		canonicalId: string;
		displayName: string;
		supportsProviderSelection: boolean;
		providers: ProviderInfo[];
		error?: string;
	};

	let titleModelProviders = $state<ProviderInfo[]>([]);
	let followUpModelProviders = $state<ProviderInfo[]>([]);
	let titleSupportsProviderSelection = $state(false);
	let followUpSupportsProviderSelection = $state(false);

	const enabledModels = $derived(
		Object.values(Provider)
			.flatMap((provider) =>
				models.from(provider).map((m) => ({
					value: m.id,
					label: m.name,
					provider: provider,
				}))
			)
			.filter((m) => {
				const key = `${m.provider}:${m.value}`;
				return models.enabled[key] !== undefined;
			})
	);

	function formatProviderName(id: string): string {
		return id
			.split(/[-_]/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function formatPrice(pricing: { inputPer1kTokens: number; outputPer1kTokens: number }): string {
		return `$${pricing.inputPer1kTokens.toFixed(4)}/$${pricing.outputPer1kTokens.toFixed(4)}`;
	}

	async function fetchModelProviders(modelId: string): Promise<ModelProvidersResponse | null> {
		if (!modelId) return null;
		try {
			const response = await fetch(`/api/model-providers?modelId=${encodeURIComponent(modelId)}`);
			if (!response.ok) return null;
			return await response.json();
		} catch (e) {
			console.error('Error fetching providers:', e);
			return null;
		}
	}

	$effect(() => {
		if (titleModelId) {
			fetchModelProviders(titleModelId).then((data) => {
				if (data) {
					titleSupportsProviderSelection = data.supportsProviderSelection;
					titleModelProviders = data.providers?.filter((p) => p.available) || [];
					// Reset provider if current selection is invalid for new model
					if (titleProviderId && !titleModelProviders.some((p) => p.provider === titleProviderId)) {
						updateTitleProvider('');
					}
				} else {
					titleSupportsProviderSelection = false;
					titleModelProviders = [];
				}
			});
		} else {
			titleSupportsProviderSelection = false;
			titleModelProviders = [];
		}
	});

	$effect(() => {
		if (followUpModelId) {
			fetchModelProviders(followUpModelId).then((data) => {
				if (data) {
					followUpSupportsProviderSelection = data.supportsProviderSelection;
					followUpModelProviders = data.providers?.filter((p) => p.available) || [];
					// Reset provider if current selection is invalid for new model
					if (
						followUpProviderId &&
						!followUpModelProviders.some((p) => p.provider === followUpProviderId)
					) {
						updateFollowUpProvider('');
					}
				} else {
					followUpSupportsProviderSelection = false;
					followUpModelProviders = [];
				}
			});
		} else {
			followUpSupportsProviderSelection = false;
			followUpModelProviders = [];
		}
	});

	$effect(() => {
		if (memoryModelId) {
			fetchModelProviders(memoryModelId).then((data) => {
				if (data) {
					memorySupportsProviderSelection = data.supportsProviderSelection;
					memoryModelProviders = data.providers?.filter((p) => p.available) || [];
					if (memoryProviderId && !memoryModelProviders.some((p) => p.provider === memoryProviderId)) {
						saveSetting({ memoryProviderId: '' });
						memoryProviderId = '';
					}
				} else {
					memorySupportsProviderSelection = false;
					memoryModelProviders = [];
				}
			});
		} else {
			memorySupportsProviderSelection = false;
			memoryModelProviders = [];
		}
	});

	async function saveSetting(fields: Record<string, unknown>) {
		if (!session.current?.user.id) return;
		await mutate(
			api.user_settings.set.url,
			{ action: 'update', ...fields },
			{ invalidatePatterns: [api.user_settings.get.url] }
		);
	}

	async function addMemory(e: SubmitEvent) {
		e.preventDefault();
		const content = newMemory.trim();
		if (!content) return;
		await mutate(api.user_memories.save.url, { action: 'create', content }, memoryInvalidate);
		newMemory = '';
	}

	async function saveMemoryEdit() {
		if (!editingMemoryId) return;
		const content = editingMemoryText.trim();
		if (content) {
			await mutate(
				api.user_memories.save.url,
				{ action: 'update', id: editingMemoryId, content },
				memoryInvalidate
			);
		}
		editingMemoryId = null;
	}

	async function deleteMemory(id: string) {
		await mutate(
			`${api.user_memories.remove.url}?id=${encodeURIComponent(id)}`,
			{ method: 'DELETE' },
			memoryInvalidate
		);
	}

	async function clearMemories() {
		const res = await callModal({
			title: 'Clear All Memories',
			description: 'Delete everything the AI remembers about you? This cannot be undone.',
			actions: { cancel: 'outline', delete: 'destructive' },
		});
		if (res !== 'delete') return;
		await mutate(`${api.user_memories.remove.url}?all=true`, { method: 'DELETE' }, memoryInvalidate);
	}

	async function updateTitleProvider(id: string) {
		titleProviderId = id;
		if (!session.current?.user.id) return;

		await mutate(
			api.user_settings.set.url,
			{
				action: 'update',
				titleProviderId: id,
				// Do NOT reset model ID
			},
			{
				invalidatePatterns: [api.user_settings.get.url],
			}
		);
	}

	async function updateTitleModel(id: string) {
		titleModelId = id;
		// Provider will be reset in the effect if needed
		if (!session.current?.user.id) return;

		await mutate(
			api.user_settings.set.url,
			{
				action: 'update',
				titleModelId: id,
			},
			{
				invalidatePatterns: [api.user_settings.get.url],
			}
		);
	}

	async function updateFollowUpProvider(id: string) {
		followUpProviderId = id;
		if (!session.current?.user.id) return;

		await mutate(
			api.user_settings.set.url,
			{
				action: 'update',
				followUpProviderId: id,
				// Do NOT reset model ID
			},
			{
				invalidatePatterns: [api.user_settings.get.url],
			}
		);
	}

	async function updateFollowUpModel(id: string) {
		followUpModelId = id;
		// Provider will be reset in the effect if needed
		if (!session.current?.user.id) return;

		await mutate(
			api.user_settings.set.url,
			{
				action: 'update',
				followUpModelId: id,
			},
			{
				invalidatePatterns: [api.user_settings.get.url],
			}
		);
	}

	let karakeepUrl = $state(settings.data?.karakeepUrl ?? '');
	let karakeepApiKey = $state('');
	let karakeepSaving = $state(false);
	let karakeepTestStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
	let karakeepTestMessage = $state('');
	let deleteAllChatsDeleting = $state(false);
	let clearUploadsClearing = $state(false);
	const hasSavedKarakeepApiKey = $derived(settings.data?.hasKarakeepApiKey ?? false);

	type SectionId = 'general' | 'ai' | 'audio' | 'integrations' | 'data' | 'security';
	let activeSection = $state<SectionId>('general');
	const sections: {
		id: SectionId;
		label: string;
		description: string;
		icon: typeof EyeOffIcon;
	}[] = [
		{
			id: 'general',
			label: 'General',
			description: 'Privacy and timezone preferences.',
			icon: EyeOffIcon,
		},
		{
			id: 'ai',
			label: 'AI & Memory',
			description: 'Memory, automatic features, and the models used for background tasks.',
			icon: BrainIcon,
		},
		{
			id: 'audio',
			label: 'Audio',
			description: 'Text-to-speech and speech-to-text preferences.',
			icon: Volume2Icon,
		},
		{
			id: 'integrations',
			label: 'Integrations',
			description: 'Connect external services to extend nanochat.',
			icon: PlugIcon,
		},
		{
			id: 'data',
			label: 'Data',
			description: 'Manage uploaded files and conversation history.',
			icon: DatabaseIcon,
		},
		{
			id: 'security',
			label: 'Security',
			description: 'Passkeys and authentication methods.',
			icon: ShieldIcon,
		},
	];
	const currentSection = $derived(sections.find((s) => s.id === activeSection) ?? sections[0]!);
	const CurrentSectionIcon = $derived(currentSection.icon);

	$effect(() => {
		if (settings.data?.karakeepUrl !== undefined) karakeepUrl = settings.data.karakeepUrl ?? '';
	});

	async function togglePrivacyMode(v: boolean) {
		privacyMode = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					privacyMode: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) privacyMode = !v;
	}

	async function toggleAutoCompact(v: boolean) {
		autoCompactEnabled = v;
		const res = await ResultAsync.fromPromise(saveSetting({ autoCompactEnabled: v }), (e) => e);
		if (res.isErr()) autoCompactEnabled = !v;
	}

	async function togglePersistentMemory(v: boolean) {
		persistentMemoryEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					persistentMemoryEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) persistentMemoryEnabled = !v;
	}

	async function toggleYoutubeTranscripts(v: boolean) {
		youtubeTranscriptsEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					youtubeTranscriptsEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) youtubeTranscriptsEnabled = !v;
	}

	async function toggleWebScraping(v: boolean) {
		webScrapingEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					webScrapingEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) webScrapingEnabled = !v;
	}

	async function toggleMcp(v: boolean) {
		mcpEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					mcpEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) mcpEnabled = !v;
	}

	async function saveTimezone() {
		if (!session.current?.user.id) return;
		const resolvedTimezone = timezone || browserTimezone || 'UTC';
		timezone = resolvedTimezone;
		timezoneSaving = true;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					timezone: resolvedTimezone,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) {
			console.error(res.error);
		}

		timezoneSaving = false;
	}

	async function toggleFollowUpQuestions(v: boolean) {
		followUpQuestionsEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					followUpQuestionsEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) followUpQuestionsEnabled = !v;
	}

	async function toggleSuggestedPrompts(v: boolean) {
		suggestedPromptsEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					suggestedPromptsEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) suggestedPromptsEnabled = !v;
	}

	async function saveKarakeepSettings() {
		if (!session.current?.user.id) return;

		karakeepSaving = true;
		const payload: Record<string, unknown> = {
			action: 'update',
			karakeepUrl,
		};

		if (karakeepApiKey.trim().length > 0) {
			payload.karakeepApiKey = karakeepApiKey.trim();
		}

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				payload,
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		karakeepSaving = false;
		if (res.isErr()) {
			console.error('Failed to save Karakeep settings:', res.error);
			return;
		}

		karakeepApiKey = '';
		karakeepTestStatus = 'idle';
		karakeepTestMessage = '';
	}

	async function clearKarakeepApiKey() {
		if (!session.current?.user.id) return;

		karakeepSaving = true;
		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					karakeepApiKey: null,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		karakeepSaving = false;
		if (res.isErr()) {
			console.error('Failed to clear Karakeep API key:', res.error);
			return;
		}

		karakeepApiKey = '';
		karakeepTestStatus = 'idle';
		karakeepTestMessage = '';
	}

	async function testKarakeepConnection() {
		if (!karakeepUrl || !karakeepApiKey) {
			karakeepTestStatus = 'error';
			karakeepTestMessage = 'Please enter both URL and API key';
			return;
		}

		karakeepTestStatus = 'testing';
		karakeepTestMessage = '';

		try {
			const baseUrl = karakeepUrl.endsWith('/') ? karakeepUrl.slice(0, -1) : karakeepUrl;
			const response = await fetch(`${baseUrl}/api/v1/users/me`, {
				headers: {
					Authorization: `Bearer ${karakeepApiKey}`,
				},
			});

			if (response.ok) {
				karakeepTestStatus = 'success';
				karakeepTestMessage = 'Connection successful!';
			} else {
				karakeepTestStatus = 'error';
				karakeepTestMessage = `Connection failed: ${response.status} ${response.statusText}`;
			}
		} catch (error) {
			karakeepTestStatus = 'error';
			karakeepTestMessage = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	}

	async function deleteAllChats() {
		const res = await callModal({
			title: 'Delete All Chats',
			description:
				'Are you sure you want to delete all your conversations? This action cannot be undone and will permanently delete all conversations and their associated messages.',
			actions: { cancel: 'outline', delete: 'destructive' },
		});

		if (res !== 'delete') return;

		if (!session.current?.user.id) return;

		deleteAllChatsDeleting = true;

		try {
			const response = await fetch(api.conversations.deleteAll.url, {
				method: 'DELETE',
				credentials: 'include',
			});

			if (!response.ok) {
				throw new Error(`Failed to delete all chats: ${response.status} ${response.statusText}`);
			}

			// Invalidate both conversations and messages cache so the sidebar updates immediately
			invalidateQueryPattern(api.conversations.get.url);
			invalidateQueryPattern(api.messages.getAllFromConversation.url);

			// Navigate to /chat to avoid stale conversation URL
			await goto('/chat');

			// Show success feedback
			await callModal({
				title: 'Success',
				description: 'All conversations have been deleted successfully.',
				actions: { ok: 'default' },
			});
		} catch (error) {
			console.error('Failed to delete all chats:', error);
			// Show error feedback
			await callModal({
				title: 'Error',
				description:
					error instanceof Error ? error.message : 'Failed to delete all chats. Please try again.',
				actions: { ok: 'default' },
			});
		} finally {
			deleteAllChatsDeleting = false;
		}
	}

	async function clearAllUploads() {
		const res = await callModal({
			title: 'Clear All Uploads',
			description:
				'Are you sure you want to delete all uploaded files? This action cannot be undone and will permanently delete all images and documents you have uploaded.',
			actions: { cancel: 'outline', delete: 'destructive' },
		});

		if (res !== 'delete') return;

		if (!session.current?.user.id) return;

		clearUploadsClearing = true;

		try {
			const response = await fetch('/api/storage/clear', {
				method: 'DELETE',
				credentials: 'include',
			});

			if (!response.ok) {
				throw new Error(`Failed to clear uploads: ${response.status} ${response.statusText}`);
			}

			const result = await response.json();

			// Show success feedback
			await callModal({
				title: 'Success',
				description: `${result.deletedCount} uploaded file${result.deletedCount !== 1 ? 's' : ''} ${result.deletedCount !== 1 ? 'have' : 'has'} been deleted successfully.`,
				actions: { ok: 'default' },
			});
		} catch (error) {
			console.error('Failed to clear uploads:', error);
			// Show error feedback
			await callModal({
				title: 'Error',
				description:
					error instanceof Error ? error.message : 'Failed to clear uploads. Please try again.',
				actions: { ok: 'default' },
			});
		} finally {
			clearUploadsClearing = false;
		}
	}

	const ttsModels = [
		{ value: 'gpt-4o-mini-tts', label: 'GPT-4o Mini (OpenAI) - $0.0006/1k' },
		{ value: 'tts-1', label: 'TTS-1 (Standard) - $0.015/1k' },
		{ value: 'tts-1-hd', label: 'TTS-1 HD (High Def) - $0.030/1k' },
		{ value: 'Kokoro-82m', label: 'Kokoro (Multilingual) - $0.001/1k' },
		{ value: 'Elevenlabs-Turbo-V2.5', label: 'ElevenLabs Turbo - $0.06/1k' },
	];

	const sttModels = [
		{ value: 'Whisper-Large-V3', label: 'Whisper Large V3 (OpenAI) - $0.01/min' },
		{ value: 'Wizper', label: 'Wizper (Fast) - $0.01/min' },
		{ value: 'Elevenlabs-STT', label: 'ElevenLabs STT - $0.03/min' },
	];

	const openAiVoices = [
		{ value: 'alloy', label: 'Alloy' },
		{ value: 'echo', label: 'Echo' },
		{ value: 'fable', label: 'Fable' },
		{ value: 'onyx', label: 'Onyx' },
		{ value: 'nova', label: 'Nova' },
		{ value: 'shimmer', label: 'Shimmer' },
		{ value: 'ash', label: 'Ash' },
		{ value: 'ballad', label: 'Ballad' },
		{ value: 'coral', label: 'Coral' },
		{ value: 'sage', label: 'Sage' },
		{ value: 'verse', label: 'Verse' },
	];

	const kokoroVoices = [
		// American Female
		{ value: 'af_alloy', label: 'Alloy (US F)' },
		{ value: 'af_aoede', label: 'Aoede (US F)' },
		{ value: 'af_bella', label: 'Bella (US F)' },
		{ value: 'af_jessica', label: 'Jessica (US F)' },
		{ value: 'af_nova', label: 'Nova (US F)' },
		// American Male
		{ value: 'am_adam', label: 'Adam (US M)' },
		{ value: 'am_echo', label: 'Echo (US M)' },
		{ value: 'am_eric', label: 'Eric (US M)' },
		{ value: 'am_liam', label: 'Liam (US M)' },
		{ value: 'am_onyx', label: 'Onyx (US M)' },
		// British Female
		{ value: 'bf_alice', label: 'Alice (UK F)' },
		{ value: 'bf_emma', label: 'Emma (UK F)' },
		{ value: 'bf_isabella', label: 'Isabella (UK F)' },
		{ value: 'bf_lily', label: 'Lily (UK F)' },
		// British Male
		{ value: 'bm_daniel', label: 'Daniel (UK M)' },
		{ value: 'bm_fable', label: 'Fable (UK M)' },
		{ value: 'bm_george', label: 'George (UK M)' },
		{ value: 'bm_lewis', label: 'Lewis (UK M)' },
		// Japanese
		{ value: 'jf_alpha', label: 'Alpha (Japanese F)' },
		{ value: 'jf_gongitsune', label: 'Gongitsune (Japanese F)' },
		{ value: 'jf_nezumi', label: 'Nezumi (Japanese F)' },
		{ value: 'jf_tebukuro', label: 'Tebukuro (Japanese F)' },
		// This list is curated from docs
		{ value: 'zf_xiaoxiao', label: 'Xiaoxiao (Chinese F)' },
		{ value: 'ff_siwis', label: 'Siwis (French F)' },
		{ value: 'im_nicola', label: 'Nicola (Italian M)' },
		{ value: 'hf_alpha', label: 'Alpha (Hindi F)' },
	];

	const elevenLabsVoices = [
		'Adam',
		'Alice',
		'Antoni',
		'Aria',
		'Arnold',
		'Bella',
		'Bill',
		'Brian',
		'Callum',
		'Charlie',
		'Charlotte',
		'Chris',
		'Daniel',
		'Domi',
		'Dorothy',
		'Drew',
		'Elli',
		'Emily',
		'Eric',
		'Ethan',
		'Fin',
		'Freya',
		'George',
		'Gigi',
		'Giovanni',
		'Grace',
		'James',
		'Jeremy',
		'Jessica',
		'Joseph',
		'Josh',
		'Laura',
		'Liam',
		'Lily',
		'Matilda',
		'Matthew',
		'Michael',
		'Nicole',
		'Rachel',
		'River',
		'Roger',
		'Ryan',
		'Sam',
		'Sarah',
		'Thomas',
		'Will',
	].map((name) => ({ value: name, label: name }));

	let availableVoices = $derived(
		localSettings.ttsModel?.startsWith('Eleven')
			? elevenLabsVoices
			: localSettings.ttsModel?.startsWith('Kokoro')
				? kokoroVoices
				: openAiVoices
	);
</script>

<svelte:head>
	<title>Account | nanochat</title>
</svelte:head>

<!-- Section navigation: segmented control style -->
<div class="scrollbar-hide overflow-x-auto">
	<div
		class="bg-muted/50 border-border inline-flex min-w-full items-center gap-0.5 rounded-lg border p-1"
		role="tablist"
	>
		{#each sections as section (section.id)}
			{@const Icon = section.icon}
			{@const isActive = activeSection === section.id}
			<button
				type="button"
				role="tab"
				aria-selected={isActive}
				onclick={() => (activeSection = section.id)}
				class={cn(
					'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all',
					isActive
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'
				)}
			>
				<Icon class={cn('size-4', isActive ? 'text-primary' : '')} />
				{section.label}
			</button>
		{/each}
	</div>
</div>

<!-- Section header -->
<div class="mt-6 flex items-center gap-3">
	<div
		class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg"
	>
		<CurrentSectionIcon class="size-5" />
	</div>
	<div class="flex min-w-0 flex-col">
		<h1 class="text-xl font-bold tracking-tight">{currentSection.label}</h1>
		<p class="text-muted-foreground text-sm">{currentSection.description}</p>
	</div>
</div>

<div class="mt-6">
	{#if activeSection === 'general'}
		<section class="flex flex-col gap-4">
			<div class="bg-card border-border rounded-lg border">
				<div class="flex items-center justify-between gap-4 p-5">
					<div class="flex min-w-0 flex-col gap-1">
						<span class="font-medium">Hide Personal Information</span>
						<span class="text-muted-foreground text-sm"
							>Blur your name and avatar in the sidebar.</span
						>
					</div>
					<Switch bind:value={() => privacyMode, togglePrivacyMode} />
				</div>
				<div class="border-border border-t p-5">
					<div class="flex flex-col gap-3">
						<div class="flex flex-col gap-1">
							<span class="font-medium">Timezone</span>
							<span class="text-muted-foreground text-sm">
								Used for scheduled tasks and date/time variables in prompts.
							</span>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<Input
								id="timezone"
								list="timezone-options"
								placeholder={browserTimezone || 'UTC'}
								bind:value={timezone}
								class="w-full max-w-[320px]"
							/>
							<Button onclick={saveTimezone} disabled={timezoneSaving} size="sm">
								{timezoneSaving ? 'Saving…' : 'Save'}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									timezone = browserTimezone;
									saveTimezone();
								}}
								disabled={timezoneSaving || !browserTimezone}
							>
								Use browser timezone
							</Button>
						</div>
						<datalist id="timezone-options">
							{#each timezoneOptions as tz}
								<option value={tz}></option>
							{/each}
						</datalist>
					</div>
				</div>
			</div>
		</section>
	{:else if activeSection === 'ai'}
		<section class="flex flex-col gap-6">
			<!-- Memory -->
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Memory</h3>
					<p class="text-muted-foreground text-xs">
						What the AI remembers across chats, and how long chats stay within the model's context.
					</p>
				</div>
				<div class="bg-card border-border divide-border divide-y rounded-lg border">
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex flex-col gap-1">
							<span class="font-medium">Persistent Memory</span>
							<span class="text-muted-foreground text-sm"
								>Remember facts about you across different conversations. Extracted after each reply
								by the memory model below; you can edit them any time.</span
							>
						</div>
						<Switch bind:value={() => persistentMemoryEnabled, togglePersistentMemory} />
					</div>
					<div class="flex flex-col gap-3 p-5">
						<div class="flex items-center justify-between gap-4">
							<span class="text-sm font-medium">Memories ({memories.data?.length ?? 0})</span>
							{#if (memories.data?.length ?? 0) > 0}
								<Button size="sm" variant="ghost" onclick={clearMemories}>Clear all</Button>
							{/if}
						</div>
						{#if memories.data && memories.data.length > 0}
							<ul class="divide-border divide-y rounded-md border">
								{#each memories.data as memory (memory.id)}
									<li class="flex items-start gap-2 px-3 py-2 text-sm">
										{#if editingMemoryId === memory.id}
											<Input
												class="flex-1"
												bind:value={editingMemoryText}
												onkeydown={(e) => {
													if (e.key === 'Enter') saveMemoryEdit();
													if (e.key === 'Escape') editingMemoryId = null;
												}}
											/>
											<Button size="sm" variant="outline" onclick={saveMemoryEdit}>Save</Button>
										{:else}
											<button
												type="button"
												class="flex-1 text-left"
												title="Click to edit"
												onclick={() => {
													editingMemoryId = memory.id;
													editingMemoryText = memory.content;
												}}>{memory.content}</button
											>
											<Button
												size="icon"
												variant="ghost"
												class="size-7 shrink-0"
												aria-label="Delete memory"
												onclick={() => deleteMemory(memory.id)}
											>
												<Trash2 class="size-3.5" />
											</Button>
										{/if}
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-muted-foreground text-sm">Nothing remembered yet.</p>
						{/if}
						<form class="flex gap-2" onsubmit={addMemory}>
							<Input
								class="flex-1"
								placeholder="Add a memory, e.g. I prefer short answers"
								maxlength={500}
								bind:value={newMemory}
							/>
							<Button type="submit" size="sm" variant="outline" disabled={!newMemory.trim()}>Add</Button>
						</form>
					</div>
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex flex-col gap-1">
							<span class="font-medium">Auto-compact Chats</span>
							<span class="text-muted-foreground text-sm"
								>When a chat nears the model's context limit, older messages are summarized so the
								conversation can keep going.</span
							>
						</div>
						<Switch bind:value={() => autoCompactEnabled, toggleAutoCompact} />
					</div>
					{#if autoCompactEnabled}
						<div class="flex items-center justify-between gap-4 p-5">
							<div class="flex flex-col gap-1">
								<label for="compact-threshold" class="font-medium">Compact at</label>
								<span class="text-muted-foreground text-sm"
									>Percent of the model's context length that triggers compaction (30-95).</span
								>
							</div>
							<div class="flex items-center gap-2">
								<Input
									id="compact-threshold"
									type="number"
									min={30}
									max={95}
									class="w-20"
									bind:value={autoCompactThreshold}
									onchange={() => saveSetting({ autoCompactThreshold: Number(autoCompactThreshold) })}
								/>
								<span class="text-muted-foreground text-sm">%</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Features -->
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Features
					</h3>
					<p class="text-muted-foreground text-xs">Automatic AI capabilities and enhancements.</p>
				</div>
				<div class="bg-card border-border divide-border divide-y rounded-lg border">
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex flex-col gap-1">
							<span class="font-medium">YouTube Transcripts</span>
							<span class="text-muted-foreground text-sm"
								>Automatically fetch YouTube video transcripts ($0.01 each).</span
							>
						</div>
						<Switch bind:value={() => youtubeTranscriptsEnabled, toggleYoutubeTranscripts} />
					</div>
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex flex-col gap-1">
							<span class="font-medium">Web Scraping</span>
							<span class="text-muted-foreground text-sm"
								>Automatically scrape web page content when URLs are detected.</span
							>
						</div>
						<Switch bind:value={() => webScrapingEnabled, toggleWebScraping} />
					</div>
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex min-w-0 flex-col gap-1">
							<span class="font-medium">Nano-GPT MCP</span>
							<span class="text-muted-foreground text-sm">
								Vision, YouTube Transcripts, Web Scraping, Nano-GPT Balance, Image Generation, and
								Model Lists.
							</span>
							{#if data.restrictions?.mcpDisabled}
								<span class="text-xs text-amber-600 dark:text-amber-400"
									>Not available when using server API key with subscription-only mode.</span
								>
							{/if}
						</div>
						<Switch
							bind:value={() => mcpEnabled, toggleMcp}
							disabled={data.restrictions?.mcpDisabled}
						/>
					</div>
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex flex-col gap-1">
							<span class="font-medium">Follow-up Questions</span>
							<span class="text-muted-foreground text-sm"
								>Show suggested follow-up questions after each response.</span
							>
						</div>
						<Switch bind:value={() => followUpQuestionsEnabled, toggleFollowUpQuestions} />
					</div>
					<div class="flex items-center justify-between gap-4 p-5">
						<div class="flex flex-col gap-1">
							<span class="font-medium">Suggested Prompts</span>
							<span class="text-muted-foreground text-sm"
								>Show suggested prompts on the home screen.</span
							>
						</div>
						<Switch bind:value={() => suggestedPromptsEnabled, toggleSuggestedPrompts} />
					</div>
				</div>
			</div>

			<!-- Model preferences -->
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Automatic Tasks
					</h3>
					<p class="text-muted-foreground text-xs">
						Which model handles background tasks like titles and suggestions.
					</p>
				</div>
				<div class="bg-card border-border rounded-lg border p-5">
					<div class="grid gap-5 md:grid-cols-2">
						<div class="flex flex-col gap-2">
							<label for="title-model" class="text-sm font-medium">Chat Title Model</label>
							<select
								id="title-model"
								class="border-input bg-background focus:ring-ring flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
								value={titleModelId}
								onchange={(e) => updateTitleModel(e.currentTarget.value)}
							>
								<option value="">Default (DeepSeek V4 Flash 0731)</option>
								{#each enabledModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
							{#if titleSupportsProviderSelection && titleModelProviders.length > 0}
								<select
									class="border-input bg-background focus:ring-ring mt-1 flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
									value={titleProviderId}
									onchange={(e) => updateTitleProvider(e.currentTarget.value)}
								>
									<option value="">Provider: Auto</option>
									{#each titleModelProviders as provider}
										<option value={provider.provider}>
											{formatProviderName(provider.provider)} ({formatPrice(provider.pricing)})
										</option>
									{/each}
								</select>
							{/if}
							<p class="text-muted-foreground text-xs">Generates chat titles.</p>
						</div>

						<div class="flex flex-col gap-2">
							<label for="followup-model" class="text-sm font-medium">Follow-up Model</label>
							<select
								id="followup-model"
								class="border-input bg-background focus:ring-ring flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
								value={followUpModelId}
								onchange={(e) => updateFollowUpModel(e.currentTarget.value)}
							>
								<option value="">Default (DeepSeek V4 Flash 0731)</option>
								{#each enabledModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
							{#if followUpSupportsProviderSelection && followUpModelProviders.length > 0}
								<select
									class="border-input bg-background focus:ring-ring mt-1 flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
									value={followUpProviderId}
									onchange={(e) => updateFollowUpProvider(e.currentTarget.value)}
								>
									<option value="">Provider: Auto</option>
									{#each followUpModelProviders as provider}
										<option value={provider.provider}>
											{formatProviderName(provider.provider)} ({formatPrice(provider.pricing)})
										</option>
									{/each}
								</select>
							{/if}
							<p class="text-muted-foreground text-xs">Generates follow-up questions.</p>
						</div>

						<div class="flex flex-col gap-2">
							<label for="memory-model" class="text-sm font-medium">Memory Model</label>
							<select
								id="memory-model"
								class="border-input bg-background focus:ring-ring flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
								value={memoryModelId}
								onchange={(e) => {
									memoryModelId = e.currentTarget.value;
									saveSetting({ memoryModelId: memoryModelId });
								}}
							>
								<option value="">Default (DeepSeek V4 Flash 0731)</option>
								{#each enabledModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
							{#if memorySupportsProviderSelection && memoryModelProviders.length > 0}
								<select
									class="border-input bg-background focus:ring-ring mt-1 flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
									value={memoryProviderId}
									onchange={(e) => {
										memoryProviderId = e.currentTarget.value;
										saveSetting({ memoryProviderId: memoryProviderId });
									}}
								>
									<option value="">Provider: Auto</option>
									{#each memoryModelProviders as provider}
										<option value={provider.provider}>
											{formatProviderName(provider.provider)} ({formatPrice(provider.pricing)})
										</option>
									{/each}
								</select>
							{/if}
							<p class="text-muted-foreground text-xs">Extracts persistent memories from your chats.</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	{:else if activeSection === 'audio'}
		<section class="flex flex-col gap-6">
			<!-- Text to Speech -->
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Text to Speech
					</h3>
					<p class="text-muted-foreground text-xs">Read messages aloud with your chosen voice.</p>
				</div>
				<div class="bg-card border-border rounded-lg border p-5">
					<div class="grid gap-5 md:grid-cols-2">
						<div class="flex flex-col gap-2">
							<label for="tts-model" class="text-sm font-medium">Model</label>
							<select
								id="tts-model"
								class="border-input bg-background focus:ring-ring flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
								bind:value={localSettings.ttsModel}
								onchange={() => {
									if (localSettings.ttsModel?.startsWith('Eleven'))
										localSettings.ttsVoice = 'Rachel';
									else if (localSettings.ttsModel?.startsWith('Kokoro'))
										localSettings.ttsVoice = 'af_bella';
									else localSettings.ttsVoice = 'alloy';
								}}
							>
								{#each ttsModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
						</div>
						<div class="flex flex-col gap-2">
							<label for="tts-voice" class="text-sm font-medium">Voice</label>
							<select
								id="tts-voice"
								class="border-input bg-background focus:ring-ring flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
								bind:value={localSettings.ttsVoice}
							>
								{#each availableVoices as voice}
									<option value={voice.value}>{voice.label}</option>
								{/each}
							</select>
						</div>
					</div>
					<div class="mt-5 flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<label for="tts-speed" class="text-sm font-medium">Speed</label>
							<span class="text-muted-foreground text-xs tabular-nums">{localSettings.ttsSpeed}x</span>
						</div>
						<input
							id="tts-speed"
							type="range"
							min="0.25"
							max="4.0"
							step="0.05"
							class="accent-primary h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
							bind:value={localSettings.ttsSpeed}
						/>
					</div>
				</div>
			</div>

			<!-- Speech to Text -->
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Speech to Text
					</h3>
					<p class="text-muted-foreground text-xs">Transcribe your voice into messages.</p>
				</div>
				<div class="bg-card border-border rounded-lg border p-5">
					<div class="flex flex-col gap-2">
						<label for="stt-model" class="text-sm font-medium">Model</label>
						<select
							id="stt-model"
							class="border-input bg-background focus:ring-ring flex h-10 w-full max-w-md items-center rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
							bind:value={localSettings.sttModel}
						>
							{#each sttModels as model}
								<option value={model.value}>{model.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</section>
	{:else if activeSection === 'integrations'}
		<section class="flex flex-col gap-4">
			<div class="bg-card border-border rounded-lg border">
				<div class="border-border flex flex-col gap-1 border-b p-5">
					<h3 class="font-medium">Karakeep</h3>
					<p class="text-muted-foreground text-sm">
						Save chats as bookmarks to your Karakeep instance.
					</p>
				</div>
				<div class="grid gap-4 p-5">
					<div class="grid gap-4 md:grid-cols-2">
						<div class="flex flex-col gap-2">
							<label for="karakeep-url" class="text-sm font-medium">URL</label>
							<Input
								id="karakeep-url"
								type="url"
								placeholder="https://karakeep.example.com"
								bind:value={karakeepUrl}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<label for="karakeep-api-key" class="text-sm font-medium">
								API Key
								{#if hasSavedKarakeepApiKey}
									<span class="text-muted-foreground ml-1 font-normal">(saved)</span>
								{/if}
							</label>
							<Input
								id="karakeep-api-key"
								type="password"
								placeholder={
									hasSavedKarakeepApiKey ? 'Enter a new key to replace' : 'Your API key'
								}
								bind:value={karakeepApiKey}
							/>
						</div>
					</div>

					<div class="flex flex-wrap gap-2">
						<Button size="sm" onclick={saveKarakeepSettings} disabled={karakeepSaving}>
							{karakeepSaving ? 'Saving…' : 'Save'}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onclick={testKarakeepConnection}
							disabled={karakeepTestStatus === 'testing'}
						>
							{karakeepTestStatus === 'testing' ? 'Testing…' : 'Test Connection'}
						</Button>
						{#if hasSavedKarakeepApiKey}
							<Button
								size="sm"
								variant="ghost"
								onclick={clearKarakeepApiKey}
								disabled={karakeepSaving}
							>
								Clear Saved Key
							</Button>
						{/if}
					</div>

					{#if karakeepTestStatus !== 'idle' && karakeepTestMessage}
						<div
							class="flex items-start gap-2 rounded-md border p-3 text-sm {karakeepTestStatus ===
							'success'
								? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
								: 'border-destructive/40 bg-destructive/10 text-destructive'}"
						>
							{#if karakeepTestStatus === 'success'}
								<CheckIcon class="mt-0.5 size-4 shrink-0" />
							{:else}
								<AlertTriangleIcon class="mt-0.5 size-4 shrink-0" />
							{/if}
							<span>{karakeepTestMessage}</span>
						</div>
					{/if}
				</div>
			</div>
		</section>
	{:else if activeSection === 'data'}
		<section class="flex flex-col gap-4">
			<div class="bg-card border-border rounded-lg border">
				<div class="flex flex-wrap items-center justify-between gap-4 p-5">
					<div class="flex min-w-0 items-start gap-3">
						<div class="bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md p-2">
							<FolderX class="size-5" />
						</div>
						<div class="flex flex-col gap-1">
							<span class="font-medium">Clear All Uploads</span>
							<span class="text-muted-foreground text-sm">
								Remove images, PDFs, and other attachments from every chat.
							</span>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={clearAllUploads}
						disabled={clearUploadsClearing}
					>
						{clearUploadsClearing ? 'Clearing…' : 'Clear Uploads'}
					</Button>
				</div>
			</div>

			<div class="border-destructive/30 bg-destructive/[0.03] rounded-lg border">
				<div class="flex flex-wrap items-center justify-between gap-4 p-5">
					<div class="flex min-w-0 items-start gap-3">
						<div class="bg-destructive/10 text-destructive rounded-md p-2">
							<Trash2 class="size-5" />
						</div>
						<div class="flex flex-col gap-1">
							<span class="text-destructive font-medium">Delete All Chats</span>
							<span class="text-muted-foreground text-sm">
								Permanently delete every conversation, message, and associated context.
							</span>
						</div>
					</div>
					<Button
						variant="destructive"
						size="sm"
						onclick={deleteAllChats}
						disabled={deleteAllChatsDeleting}
					>
						{deleteAllChatsDeleting ? 'Deleting…' : 'Delete All Chats'}
					</Button>
				</div>
			</div>
		</section>
	{:else if activeSection === 'security'}
		<section class="flex flex-col gap-4">
			<PasskeySettings passkeys={data.passkeys || []} />
		</section>
	{/if}
</div>
