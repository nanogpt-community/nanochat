<script lang="ts">
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { goto } from '$app/navigation';
	import { ResultAsync } from 'neverthrow';
	import { mutate } from '$lib/client/mutation.svelte';
	import type { UserSettings } from '$lib/api';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import {
		Root as Card,
		Content as CardContent,
		Description as CardDescription,
		Header as CardHeader,
		Title as CardTitle,
	} from '$lib/components/ui/card';
	import PasskeySettings from '$lib/components/account/PasskeySettings.svelte';
	import { callModal } from '$lib/components/ui/modal/global-modal.svelte';
	import ChevronDown from '~icons/lucide/chevron-down';
	import ChevronRight from '~icons/lucide/chevron-right';
	import Trash2 from '~icons/lucide/trash-2';
	import { models } from '$lib/state/models.svelte';
	import { settings as localSettings } from '$lib/state/settings.svelte';
	import { Provider } from '$lib/types.js';

	let { data } = $props();
	const settings = useCachedQuery<UserSettings>(api.user_settings.get, {});

	let privacyMode = $derived(settings.data?.privacyMode ?? false);
	let contextMemoryEnabled = $derived(settings.data?.contextMemoryEnabled ?? false);
	let persistentMemoryEnabled = $derived(settings.data?.persistentMemoryEnabled ?? false);
	let youtubeTranscriptsEnabled = $derived(settings.data?.youtubeTranscriptsEnabled ?? false);
	let webScrapingEnabled = $derived(settings.data?.webScrapingEnabled ?? false);
	let mcpEnabled = $derived(settings.data?.mcpEnabled ?? false);
	let followUpQuestionsEnabled = $derived(settings.data?.followUpQuestionsEnabled ?? true);
	let titleModelId = $state(settings.data?.titleModelId ?? '');
	let followUpModelId = $state(settings.data?.followUpModelId ?? '');

	$effect(() => {
		if (settings.data?.titleModelId) titleModelId = settings.data.titleModelId;
		if (settings.data?.followUpModelId) followUpModelId = settings.data.followUpModelId;
	});

	const enabledModels = $derived(
		Object.values(Provider)
			.flatMap((provider) => models.from(provider))
			.filter((m) => m.enabled)
			.map((m) => ({ value: m.id, label: m.name }))
	);

	async function updateTitleModel(id: string) {
		titleModelId = id;
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

	async function updateFollowUpModel(id: string) {
		followUpModelId = id;
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
	let karakeepApiKey = $state(settings.data?.karakeepApiKey ?? '');
	let karakeepSaving = $state(false);
	let karakeepTestStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
	let karakeepTestMessage = $state('');
	let karakeepExpanded = $state(false);
	let deleteAllChatsExpanded = $state(false);
	let deleteAllChatsDeleting = $state(false);

	$effect(() => {
		if (settings.data?.karakeepUrl) karakeepUrl = settings.data.karakeepUrl;
		if (settings.data?.karakeepApiKey) karakeepApiKey = settings.data.karakeepApiKey;
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

	async function toggleContextMemory(v: boolean) {
		contextMemoryEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					contextMemoryEnabled: v,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) contextMemoryEnabled = !v;
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

	async function saveKarakeepSettings() {
		if (!session.current?.user.id) return;

		karakeepSaving = true;
		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					karakeepUrl,
					karakeepApiKey,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		karakeepSaving = false;
		if (res.isErr()) {
			console.error('Failed to save Karakeep settings:', res.error);
		}
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

		if (!session.current?.session.token) return;

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

<h1 class="text-2xl font-bold">Account Settings</h1>
<h2 class="text-muted-foreground mt-2 text-sm">Configure the settings for your account.</h2>

<div class="mt-6 flex flex-col gap-6">
	<!-- Account Settings Section -->
	<Card>
		<CardHeader>
			<CardTitle>General Settings</CardTitle>
			<CardDescription>Privacy and memory preferences for your account.</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-4">
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Hide Personal Information</span>
					<span class="text-muted-foreground text-sm"
						>Blur your name and avatar in the sidebar.</span
					>
				</div>
				<Switch bind:value={() => privacyMode, togglePrivacyMode} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Context Memory</span>
					<span class="text-muted-foreground text-sm"
						>Compress long conversations for better context retention.</span
					>
				</div>
				<Switch bind:value={() => contextMemoryEnabled, toggleContextMemory} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Persistent Memory</span>
					<span class="text-muted-foreground text-sm"
						>Remember facts about you across different conversations.</span
					>
				</div>
				<Switch bind:value={() => persistentMemoryEnabled, togglePersistentMemory} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">YouTube Transcripts</span>
					<span class="text-muted-foreground text-sm"
						>Automatically fetch YouTube video transcripts ($0.01 each).</span
					>
				</div>
				<Switch bind:value={() => youtubeTranscriptsEnabled, toggleYoutubeTranscripts} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Web Scraping</span>
					<span class="text-muted-foreground text-sm"
						>Automatically scrape web page content when URLs are detected.</span
					>
				</div>
				<Switch bind:value={() => webScrapingEnabled, toggleWebScraping} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">MCP Tools</span>
					<span class="text-muted-foreground text-sm"
						>Enable Model Context Protocol tools for enhanced capabilities.</span
					>
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
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Follow-up Questions</span>
					<span class="text-muted-foreground text-sm"
						>Show suggested follow-up questions after each response.</span
					>
				</div>
				<Switch bind:value={() => followUpQuestionsEnabled, toggleFollowUpQuestions} />
			</div>

			<div class="mt-2 border-t pt-4">
				<h3 class="mb-3 font-medium">Model Preferences</h3>
				<div class="grid gap-4">
					<div class="flex flex-col gap-2">
						<label
							class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Chat Title Generation Model
							<select
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring mt-2 flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								value={titleModelId}
								onchange={(e) => updateTitleModel(e.currentTarget.value)}
							>
								<option value="">Default (GLM-4.5-Air)</option>
								{#each enabledModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
						</label>
						<p class="text-muted-foreground text-xs">
							Select the model used to generate chat titles.
						</p>
					</div>

					<div class="flex flex-col gap-2">
						<label
							class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Follow-up Questions Model
							<select
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring mt-2 flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								value={followUpModelId}
								onchange={(e) => updateFollowUpModel(e.currentTarget.value)}
							>
								<option value="">Default (GLM-4.5-Air)</option>
								{#each enabledModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
						</label>
						<p class="text-muted-foreground text-xs">
							Select the model used to generate follow-up questions.
						</p>
					</div>
				</div>
			</div>

			<div class="mt-2 border-t pt-4">
				<h3 class="mb-3 font-medium">Text to Speech</h3>
				<div class="grid gap-4">
					<div class="flex flex-col gap-2">
						<label
							class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Model
							<select
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring mt-2 flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
						</label>
						<p class="text-muted-foreground text-xs">
							Choose a TTS model. Pricing varies significantly.
						</p>
					</div>

					<div class="flex flex-col gap-2">
						<label
							class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Voice
							<select
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring mt-2 flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								bind:value={localSettings.ttsVoice}
							>
								{#each availableVoices as voice}
									<option value={voice.value}>{voice.label}</option>
								{/each}
							</select>
						</label>
						<p class="text-muted-foreground text-xs">
							Select the voice used for reading messages aloud.
						</p>
					</div>

					<div class="flex flex-col gap-2">
						<div class="flex justify-between">
							<label class="text-sm leading-none font-medium">Speed</label>
							<span class="text-muted-foreground text-xs">{localSettings.ttsSpeed}x</span>
						</div>
						<input
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

			<div class="mt-2 border-t pt-4">
				<h3 class="mb-3 font-medium">Speech to Text</h3>
				<div class="grid gap-4">
					<div class="flex flex-col gap-2">
						<label
							class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Model
							<select
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring mt-2 flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								bind:value={localSettings.sttModel}
							>
								{#each sttModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
						</label>
						<p class="text-muted-foreground text-xs">
							Choose an STT model for voice transcription.
						</p>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Karakeep Integration Section (Collapsible) -->
	<Card>
		<button
			type="button"
			class="w-full text-left"
			onclick={() => (karakeepExpanded = !karakeepExpanded)}
		>
			<CardHeader class="hover:bg-muted/50 cursor-pointer rounded-t-lg transition-colors">
				<div class="flex items-center justify-between">
					<div>
						<CardTitle>Karakeep Integration</CardTitle>
						<CardDescription>
							Configure your Karakeep instance to save chats as bookmarks.
						</CardDescription>
					</div>
					<div class="text-muted-foreground">
						{#if karakeepExpanded}
							<ChevronDown class="h-5 w-5" />
						{:else}
							<ChevronRight class="h-5 w-5" />
						{/if}
					</div>
				</div>
			</CardHeader>
		</button>

		{#if karakeepExpanded}
			<CardContent class="grid gap-4 pt-0">
				<div class="flex flex-col gap-2">
					<label for="karakeep-url" class="text-sm font-medium">Karakeep URL</label>
					<Input
						id="karakeep-url"
						type="url"
						placeholder="https://karakeep.example.com"
						bind:value={karakeepUrl}
					/>
					<span class="text-muted-foreground text-xs">The URL of your Karakeep instance</span>
				</div>

				<div class="flex flex-col gap-2">
					<label for="karakeep-api-key" class="text-sm font-medium">API Key</label>
					<Input
						id="karakeep-api-key"
						type="password"
						placeholder="Enter your Karakeep API key"
						bind:value={karakeepApiKey}
					/>
					<span class="text-muted-foreground text-xs">Your Karakeep API authentication key</span>
				</div>

				<div class="flex gap-2">
					<Button onclick={saveKarakeepSettings} disabled={karakeepSaving}>
						{karakeepSaving ? 'Saving...' : 'Save Settings'}
					</Button>
					<Button
						variant="outline"
						onclick={testKarakeepConnection}
						disabled={karakeepTestStatus === 'testing'}
					>
						{karakeepTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
					</Button>
				</div>

				{#if karakeepTestStatus !== 'idle' && karakeepTestMessage}
					<div
						class="rounded-md p-3 text-sm {karakeepTestStatus === 'success'
							? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
							: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'}"
					>
						{karakeepTestMessage}
					</div>
				{/if}
			</CardContent>
		{/if}
	</Card>

	<!-- Delete All Chats Section (Collapsible) -->
	<Card>
		<button
			type="button"
			class="w-full text-left"
			onclick={() => (deleteAllChatsExpanded = !deleteAllChatsExpanded)}
		>
			<CardHeader class="hover:bg-muted/50 cursor-pointer rounded-t-lg transition-colors">
				<div class="flex items-center justify-between">
					<div>
						<CardTitle class="text-destructive">Delete All Chats</CardTitle>
						<CardDescription>
							Permanently delete all your conversations and messages.
						</CardDescription>
					</div>
					<div class="text-muted-foreground">
						{#if deleteAllChatsExpanded}
							<ChevronDown class="h-5 w-5" />
						{:else}
							<ChevronRight class="h-5 w-5" />
						{/if}
					</div>
				</div>
			</CardHeader>
		</button>

		{#if deleteAllChatsExpanded}
			<CardContent class="pt-0">
				<div class="flex flex-col gap-4">
					<div class="border-destructive/50 bg-destructive/10 rounded-md border p-4">
						<div class="flex items-start gap-3">
							<Trash2 class="text-destructive mt-0.5 h-5 w-5 shrink-0" />
							<div class="flex flex-col gap-2">
								<p class="text-destructive font-medium">Warning: This action cannot be undone</p>
								<p class="text-muted-foreground text-sm">This will permanently delete:</p>
								<ul class="text-muted-foreground ml-1 list-inside list-disc space-y-1 text-sm">
									<li>All your conversations</li>
									<li>All messages within those conversations</li>
									<li>Any associated data and context</li>
								</ul>
							</div>
						</div>
					</div>

					<Button
						variant="destructive"
						onclick={deleteAllChats}
						disabled={deleteAllChatsDeleting}
						class="w-full sm:w-auto"
					>
						{#if deleteAllChatsDeleting}
							Deleting...
						{:else}
							Delete All Chats
						{/if}
					</Button>
				</div>
			</CardContent>
		{/if}
	</Card>

	<!-- Passkeys Section -->
	<PasskeySettings passkeys={data.passkeys || []} />
</div>
