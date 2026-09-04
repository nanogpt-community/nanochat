<script lang="ts">
	import { models } from '$lib/state/models.svelte';
	import { Provider } from '$lib/types';
	import { isImageOnlyModel, supportsVideo } from '$lib/utils/model-capabilities';
	import VideoIcon from '~icons/lucide/video';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Modal } from '$lib/components/ui/modal';
	import { cn } from '$lib/utils/utils';
	import { untrack } from 'svelte';
	import ImageIcon from '~icons/lucide/image';
	import SparklesIcon from '~icons/lucide/sparkles';
	import SettingsIcon from '~icons/lucide/settings-2';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';
	import DownloadIcon from '~icons/lucide/download';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import UploadIcon from '~icons/lucide/upload';
	import XIcon from '~icons/lucide/x';
	import WandIcon from '~icons/lucide/wand-2';
	import CopyIcon from '~icons/lucide/copy';
	import CheckIcon from '~icons/lucide/check';
	import SendIcon from '~icons/lucide/arrow-up';
	import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
	import StudioModelPicker from '$lib/components/model-picker/studio-model-picker.svelte';

	const isMobile = new IsMobile();

	// --- Persisted state (survives refresh / tab close) ---
	const STORAGE_KEY = 'studio-preferences';

	type StudioMode = 'image' | 'video';
	type Prefs = {
		mode: StudioMode;
		modelId: string;
		videoModelId: string;
		modelSettings: Record<string, Record<string, any>>;
	};

	function loadPrefs(): Prefs {
		const defaults: Prefs = { mode: 'image', modelId: '', videoModelId: '', modelSettings: {} };
		try {
			const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
			if (raw) return { ...defaults, ...JSON.parse(raw) };
		} catch {}
		return defaults;
	}

	function savePrefs(update: Partial<Prefs>) {
		try {
			const current = loadPrefs();
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...update }));
		} catch {}
	}

	const initialPrefs = loadPrefs();

	// --- State ---
	let prompt = $state('');
	let studioMode = $state<StudioMode>(initialPrefs.mode);
	let selectedModelId = $state(
		(initialPrefs.mode === 'video' ? initialPrefs.videoModelId : initialPrefs.modelId) || ''
	);
	let generationStatus = $state('');
	let imageParams = $state<Record<string, any>>({});
	let isGenerating = $state(false);
	let errorMessage = $state('');
	let settingsOpen = $state(false);
	let lightboxImage = $state<GeneratedImage | null>(null);
	let lightboxOpen = $state(false);
	let referenceImageId = $state<string | null>(null);
	let referenceImageUrl = $state<string | null>(null);
	let copiedPromptIndex = $state<number | null>(null);

	type GeneratedImage = {
		kind: 'image' | 'video';
		url: string;
		storage_id?: string;
		fileName: string;
		prompt: string;
		modelId: string;
		modelName: string;
		cost: number;
		timestamp: number;
	};

	let generations = $state<GeneratedImage[]>([]);

	// --- Derived ---
	const allModels = $derived(models.from(Provider.NanoGPT));
	const imageModels = $derived(allModels.filter((m) => isImageOnlyModel(m)));
	const videoModels = $derived(allModels.filter((m) => supportsVideo(m)));
	const activeModels = $derived(studioMode === 'video' ? videoModels : imageModels);
	const currentModel = $derived(activeModels.find((m) => m.id === selectedModelId) ?? null);
	const isVideoMode = $derived(studioMode === 'video');

	function switchMode(mode: StudioMode) {
		if (mode === studioMode) return;
		const prefs = loadPrefs();
		studioMode = mode;
		selectedModelId = (mode === 'video' ? prefs.videoModelId : prefs.modelId) || '';
		errorMessage = '';
		savePrefs({ mode });
	}

	// Auto-select: persisted model if still valid, otherwise first available
	$effect(() => {
		if (activeModels.length === 0) return;
		if (selectedModelId && activeModels.some((m) => m.id === selectedModelId)) return;
		selectedModelId = activeModels[0]!.id;
	});

	// Persist selected model whenever it changes
	$effect(() => {
		if (selectedModelId) {
			savePrefs(studioMode === 'video' ? { videoModelId: selectedModelId } : { modelId: selectedModelId });
		}
	});

	// --- Param normalization ---
	type ParamType = 'select' | 'boolean' | 'switch' | 'text' | 'number';
	type NormalizedParam = {
		key: string;
		label: string;
		description?: string;
		type: ParamType;
		defaultValue?: string | number | boolean;
		options?: { value: string; label: string }[];
	};

	function isPrimitive(value: unknown): value is string | number | boolean {
		return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
	}

	function normalizeParam(key: string, raw: Record<string, unknown>): NormalizedParam | null {
		const hasConfig =
			typeof raw.label === 'string' ||
			typeof raw.type === 'string' ||
			raw.default !== undefined ||
			Array.isArray(raw.options);
		if (!hasConfig) return null;

		let type = raw.type as ParamType | undefined;
		const options = Array.isArray(raw.options)
			? raw.options.filter(
					(option) =>
						option &&
						typeof option === 'object' &&
						isPrimitive((option as { value?: unknown }).value) &&
						typeof (option as { label?: unknown }).label === 'string'
				)
			: undefined;

		if (!type) {
			if (options && options.length > 0) type = 'select';
			else if (typeof raw.default === 'boolean') type = 'boolean';
			else if (typeof raw.default === 'number') type = 'number';
			else type = 'text';
		}

		if (type === 'select' && (!options || options.length === 0)) {
			type = 'text';
		}

		return {
			key,
			label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : key,
			description: typeof raw.description === 'string' ? raw.description : undefined,
			type,
			defaultValue: isPrimitive(raw.default) ? raw.default : undefined,
			options: options as { value: string; label: string }[] | undefined,
		};
	}

	const normalizedParams = $derived.by(() => {
		if (!currentModel?.additionalParams) return [] as NormalizedParam[];
		const entries = Object.entries(currentModel.additionalParams);
		const normalized: NormalizedParam[] = [];
		for (const [key, raw] of entries) {
			if (!raw || typeof raw !== 'object') continue;
			const param = normalizeParam(key, raw as Record<string, unknown>);
			if (param) normalized.push(param);
		}
		return normalized;
	});

	// Initialize defaults when model changes, restoring persisted settings where valid
	$effect(() => {
		const model = currentModel;
		if (!model) return;

		const defaults: Record<string, any> = {};

		for (const param of normalizedParams) {
			let value = param.defaultValue;
			const modelDefault = model.defaultSettings?.[param.key];
			if (value === undefined && isPrimitive(modelDefault)) value = modelDefault;

			if (param.type === 'select' && param.options && param.options.length > 0) {
				if (!param.options.some((o) => o.value === value)) {
					value = param.options[0]?.value;
				}
			}

			if (value === undefined) {
				if (param.type === 'boolean' || param.type === 'switch') value = false;
				else if (param.type === 'number') value = 0;
				else value = '';
			}
			defaults[param.key] = value;
		}

		if (model.resolutions && model.resolutions.length > 0) {
			defaults.resolution =
				typeof model.defaultSettings?.resolution === 'string'
					? model.defaultSettings.resolution
					: model.resolutions[0]?.value;
		}

		if (model.maxImages) {
			defaults.nImages =
				typeof model.defaultSettings?.nImages === 'number'
					? model.defaultSettings.nImages
					: 1;
		}

		const saved = loadPrefs().modelSettings[model.id];
		untrack(() => {
			if (saved && typeof saved === 'object') {
				const merged: Record<string, any> = { ...defaults };
				for (const [key, value] of Object.entries(saved)) {
					if (key === 'resolution' && model.resolutions) {
						if (model.resolutions.some((r) => r.value === value)) {
							merged.resolution = value;
						}
					} else if (key === 'nImages' && model.maxImages) {
						const n = Number(value);
						if (Number.isFinite(n) && n >= 1 && n <= model.maxImages) {
							merged.nImages = n;
						}
					} else if (key in defaults) {
						const param = normalizedParams.find((p) => p.key === key);
						if (param?.type === 'select' && param.options) {
							if (param.options.some((o) => o.value === value)) {
								merged[key] = value;
							}
						} else {
							merged[key] = value;
						}
					}
				}
				imageParams = merged;
			} else {
				imageParams = { ...defaults };
			}
		});
	});

	// Persist settings whenever they change
	$effect(() => {
		const params = $state.snapshot(imageParams);
		const modelId = selectedModelId;
		if (!modelId || Object.keys(params).length === 0) return;

		untrack(() => {
			const prefs = loadPrefs();
			prefs.modelSettings[modelId] = params;
			savePrefs({ modelSettings: prefs.modelSettings });
		});
	});

	// --- Actions ---
	async function pollForResult(generationId: string, capturedPrompt: string, capturedModelId: string, capturedModelName: string) {
		const POLL_INTERVAL = 1500;
		const MAX_POLLS = 200;
		let polls = 0;

		while (polls < MAX_POLLS) {
			polls++;
			await new Promise((r) => setTimeout(r, POLL_INTERVAL));

			try {
				const res = await fetch(`/api/generate-image?id=${encodeURIComponent(generationId)}`);
				if (!res.ok) {
					if (res.status === 404) {
						throw new Error('Generation expired or not found');
					}
					continue;
				}

				const status = await res.json();

				if (status.status === 'complete') {
					const newImages: GeneratedImage[] = status.images.map((img: any) => ({
						...img,
						kind: 'image' as const,
						prompt: capturedPrompt,
						modelId: capturedModelId,
						modelName: capturedModelName,
						cost: status.cost / status.images.length,
						timestamp: Date.now(),
					}));
					generations = [...newImages, ...generations];
					return;
				}

				if (status.status === 'error') {
					throw new Error(status.message || 'Generation failed');
				}
			} catch (e) {
				errorMessage = e instanceof Error ? e.message : String(e);
				return;
			}
		}

		errorMessage = 'Generation timed out. Please try again.';
	}

	async function generateVideo() {
		const capturedPrompt = prompt.trim();
		const capturedModelId = selectedModelId;
		const capturedModelName = currentModel?.name ?? selectedModelId;
		if (currentModel?.requiresImage && !referenceImageId) {
			errorMessage = 'This model needs a start image. Upload one first.';
			return;
		}

		isGenerating = true;
		errorMessage = '';
		generationStatus = 'Submitting…';

		try {
			const res = await fetch('/api/video/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: capturedModelId,
					prompt: capturedPrompt,
					...imageParams,
					reference_image_id: referenceImageId ?? undefined,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: res.statusText }));
				throw new Error(err.error || err.message || `Generation failed (${res.status})`);
			}
			const { runId } = await res.json();
			if (!runId) throw new Error('No run id returned');

			// Videos take minutes; poll slowly and ask the server to keep the file.
			const POLL_INTERVAL = 5000;
			const MAX_POLLS = 180;
			const query = new URLSearchParams({ runId, model: capturedModelId, save: '1' });
			for (let polls = 0; polls < MAX_POLLS; polls++) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
				const statusRes = await fetch(`/api/video/status?${query}`);
				if (!statusRes.ok) continue;
				const data = await statusRes.json();
				const status = data.data?.status;
				if (status === 'COMPLETED') {
					const remoteUrl: string | undefined = data.data?.output?.video?.url;
					const saved = data.data?.saved as { storageId: string; url: string } | undefined;
					const url = saved?.url ?? remoteUrl;
					if (!url) throw new Error('Video finished without a file');
					generations = [
						{
							kind: 'video',
							url,
							storage_id: saved?.storageId,
							fileName: `video-${runId}.mp4`,
							prompt: capturedPrompt,
							modelId: capturedModelId,
							modelName: capturedModelName,
							cost: Number(data.data?.cost ?? 0),
							timestamp: Date.now(),
						},
						...generations,
					];
					return;
				}
				if (status === 'FAILED' || status === 'CANCELED') {
					throw new Error(data.data?.error || 'Video generation failed');
				}
				generationStatus = status === 'IN_QUEUE' ? 'Queued…' : 'Rendering…';
			}
			throw new Error('Video generation timed out. Check My Stuff later or try again.');
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
		} finally {
			isGenerating = false;
			generationStatus = '';
		}
	}

	async function generate() {
		if (!prompt.trim() || !selectedModelId || isGenerating) return;
		if (isVideoMode) return generateVideo();

		isGenerating = true;
		errorMessage = '';

		const capturedPrompt = prompt.trim();
		const capturedModelId = selectedModelId;
		const capturedModelName = currentModel?.name ?? selectedModelId;

		try {
			const res = await fetch('/api/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model_id: selectedModelId,
					prompt: capturedPrompt,
					image_params: imageParams,
					reference_image_id: referenceImageId ?? undefined,
				}),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: res.statusText }));
				throw new Error(err.message || `Generation failed (${res.status})`);
			}

			const { generation_id } = await res.json();
			await pollForResult(generation_id, capturedPrompt, capturedModelId, capturedModelName);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
		} finally {
			isGenerating = false;
		}
	}

	function openLightbox(image: GeneratedImage) {
		lightboxImage = image;
		lightboxOpen = true;
	}

	async function handleReferenceUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const res = await fetch('/api/storage', {
				method: 'POST',
				headers: { 'Content-Type': file.type },
				body: file,
			});

			if (!res.ok) throw new Error('Upload failed');

			const { storageId, url } = await res.json();
			referenceImageId = storageId;
			referenceImageUrl = url;
		} catch (e) {
			console.error('Reference upload failed:', e);
		}

		input.value = '';
	}

	function removeReference() {
		referenceImageId = null;
		referenceImageUrl = null;
	}

	function copyPrompt(index: number, promptText: string) {
		navigator.clipboard.writeText(promptText);
		copiedPromptIndex = index;
		setTimeout(() => (copiedPromptIndex = null), 2000);
	}

	function handleKeydown(e: KeyboardEvent) {
		// Same convention as the chat composer: Enter sends, Shift+Enter breaks the line.
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			generate();
		}
	}

	/** Params worth showing inline rather than behind the Settings modal. */
	const QUICK_PARAM_KEYS = ['duration', 'aspect_ratio', 'resolution', 'mode'];
	const quickParams = $derived(
		normalizedParams.filter((p) => p.type === 'select' && QUICK_PARAM_KEYS.includes(p.key))
	);

	function useExamplePrompt() {
		if (currentModel?.examplePrompt) prompt = currentModel.examplePrompt;
	}

	const hasSettings = $derived(
		(currentModel?.resolutions && currentModel.resolutions.length > 0) ||
			(currentModel?.maxImages && currentModel.maxImages > 1) ||
			normalizedParams.length > 0
	);

	const settingsSummary = $derived.by(() => {
		const parts: string[] = [];
		if (imageParams.duration) parts.push(`${imageParams.duration}s`);
		if (imageParams.aspect_ratio) parts.push(String(imageParams.aspect_ratio));
		if (imageParams.resolution) parts.push(String(imageParams.resolution));
		if (imageParams.nImages && imageParams.nImages > 1) parts.push(`${imageParams.nImages}x`);
		if (imageParams.quality) parts.push(String(imageParams.quality));
		return parts.join(' / ') || 'Default';
	});
</script>

<svelte:head>
	<title>{isVideoMode ? 'Video Studio' : 'Image Studio'} - nanochat</title>
</svelte:head>

<!-- ==================== MOBILE LAYOUT ==================== -->
{#if isMobile.current}
	<div
		class="flex h-full flex-col"
		style="padding-top: calc(3rem + env(safe-area-inset-top));"
	>
		<!-- Scrollable image results area -->
		<div class="flex-1 overflow-y-auto">
			{#if generations.length === 0 && !isGenerating}
				<!-- Empty state -->
				<div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
					<div class="bg-muted/50 rounded-2xl p-5">
						{#if isVideoMode}
							<VideoIcon class="text-muted-foreground/50 size-10" />
						{:else}
							<ImageIcon class="text-muted-foreground/50 size-10" />
						{/if}
					</div>
					<div>
						<h2 class="font-semibold">{isVideoMode ? 'Video Studio' : 'Image Studio'}</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							Type a prompt below to generate {isVideoMode ? 'videos' : 'images'}.
						</p>
					</div>
				</div>
			{:else}
				<div class="p-3">
					{#if isGenerating}
						<div class="mb-3">
							<div class="border-primary/20 bg-primary/5 flex items-center gap-3 rounded-xl border p-3">
								<LoaderCircleIcon class="text-primary size-5 animate-spin" />
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium">{generationStatus || 'Generating...'}</p>
									<p class="text-muted-foreground truncate text-xs">{currentModel?.name}</p>
								</div>
							</div>
						</div>
					{/if}

					{#if errorMessage}
						<div class="bg-destructive/10 text-destructive mb-3 rounded-lg px-3 py-2 text-sm">
							{errorMessage}
						</div>
					{/if}

					<div class="grid grid-cols-2 gap-2">
						{#each generations as image, index (image.url)}
							<div class="border-border bg-card overflow-hidden rounded-xl border">
								{#if image.kind === 'video'}
									<!-- svelte-ignore a11y_media_has_caption -->
									<video src={image.url} controls preload="metadata" class="aspect-video w-full bg-black"></video>
								{:else}
									<button
										type="button"
										class="relative block w-full"
										onclick={() => openLightbox(image)}
									>
										<img
											src={image.url}
											alt={image.prompt}
											class="aspect-square w-full object-cover"
											loading="lazy"
										/>
									</button>
								{/if}
								<div class="flex items-center justify-between px-2 py-1.5">
									<span class="text-muted-foreground truncate text-[11px]">{image.modelName}</span>
									<div class="flex items-center gap-1">
										<a
											href={image.url}
											download={image.fileName}
											class="text-muted-foreground hover:text-foreground p-1"
										>
											<DownloadIcon class="size-3.5" />
										</a>
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground p-1"
											onclick={() => copyPrompt(index, image.prompt)}
										>
											{#if copiedPromptIndex === index}
												<CheckIcon class="size-3.5" />
											{:else}
												<CopyIcon class="size-3.5" />
											{/if}
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Reference image preview (above input bar) -->
		{#if referenceImageUrl}
			<div class="border-t px-3 pt-2">
				<div class="relative inline-block">
					<img src={referenceImageUrl} alt="Reference" class="h-14 rounded-lg border object-cover" />
					<button
						type="button"
						class="bg-background/80 absolute -top-1.5 -right-1.5 rounded-full border p-0.5"
						onclick={removeReference}
					>
						<XIcon class="size-3" />
					</button>
				</div>
			</div>
		{/if}

		<!-- Bottom input bar -->
		<div class="border-t px-3 pb-[env(safe-area-inset-bottom)] pt-2">
			<!-- Model + Settings row -->
			<div class="mb-2 flex items-center gap-2">
				{@render modeSwitch(true)}
				<StudioModelPicker bind:value={selectedModelId} models={activeModels} compact class="flex-1" />

				{#if hasSettings}
					<button
						type="button"
						class="border-input bg-background flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs"
						onclick={() => (settingsOpen = true)}
					>
						<SettingsIcon class="text-muted-foreground size-3.5" />
						<span class="text-muted-foreground max-w-[80px] truncate">{settingsSummary}</span>
					</button>
				{/if}

				{#if !isVideoMode || currentModel?.supportsImageInput}
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="border-input bg-background flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs">
						<UploadIcon class="text-muted-foreground size-3.5" />
						<input type="file" accept="image/*" class="hidden" onchange={handleReferenceUpload} />
					</label>
				{/if}
			</div>

			<!-- Prompt + send -->
			<div class="flex items-end gap-2 pb-2">
				<textarea
					class="border-input bg-background placeholder:text-muted-foreground min-h-[40px] max-h-[100px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm leading-snug outline-none"
					placeholder={isVideoMode ? 'Describe your video...' : 'Describe your image...'}
					bind:value={prompt}
					onkeydown={handleKeydown}
					rows={1}
				></textarea>
				<button
					type="button"
					class="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-50"
					disabled={!prompt.trim() || !selectedModelId || isGenerating}
					onclick={generate}
				>
					{#if isGenerating}
						<LoaderCircleIcon class="size-4 animate-spin" />
					{:else}
						<SendIcon class="size-4" />
					{/if}
				</button>
			</div>
		</div>
	</div>

<!-- ==================== DESKTOP LAYOUT ==================== -->
{:else}
	<div class="flex h-full flex-row">
		<!-- Left Panel: Controls -->
		<div class="border-border flex w-[420px] shrink-0 flex-col border-r">
			<div class="flex items-center gap-3 border-b px-5 py-4">
				<div class="bg-primary/10 text-primary rounded-xl p-2.5">
					<WandIcon class="size-5" />
				</div>
				<div>
					<h1 class="text-lg font-semibold tracking-tight">{isVideoMode ? 'Video Studio' : 'Image Studio'}</h1>
					<p class="text-muted-foreground text-xs">Create {isVideoMode ? 'videos' : 'images'} with AI</p>
				</div>
				{@render modeSwitch()}
			</div>

			<div class="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
				<!-- Model Selector -->
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">Model</label>
					<StudioModelPicker bind:value={selectedModelId} models={activeModels} />
				</div>

				{#if quickParams.length > 0}
					<div class="grid gap-2" style="grid-template-columns: repeat({Math.min(quickParams.length, 3)}, minmax(0, 1fr));">
						{#each quickParams as param (param.key)}
							<label class="flex min-w-0 flex-col gap-1">
								<span class="text-muted-foreground truncate text-xs">{param.label}</span>
								<select
									class="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm focus:outline-none"
									bind:value={imageParams[param.key]}
								>
									{#each param.options ?? [] as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</label>
						{/each}
					</div>
				{/if}

				<!-- Settings Button -->
				{#if hasSettings}
					<button
						type="button"
						class="border-input bg-background hover:bg-accent/50 flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors"
						onclick={() => (settingsOpen = true)}
					>
						<div class="flex items-center gap-2">
							<SettingsIcon class="text-muted-foreground size-4" />
							<span>Settings</span>
						</div>
						<span class="text-muted-foreground max-w-[180px] truncate text-xs">{settingsSummary}</span>
					</button>
				{/if}

				<!-- Reference Image -->
				{#if !isVideoMode || currentModel?.supportsImageInput}
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">
						{isVideoMode ? 'Start Image' : 'Reference Image'}
						<span class="text-muted-foreground font-normal">
							({currentModel?.requiresImage ? 'required' : 'optional'})
						</span>
					</label>
					{#if referenceImageUrl}
						<div class="relative">
							<img src={referenceImageUrl} alt="Reference" class="h-32 w-full rounded-lg border object-cover" />
							<button
								type="button"
								class="bg-background/80 hover:bg-background absolute top-2 right-2 rounded-full border p-1 backdrop-blur-sm transition-colors"
								onclick={removeReference}
							>
								<XIcon class="size-3.5" />
							</button>
						</div>
					{:else}
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label class="border-input hover:bg-accent/30 flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed transition-colors">
							<UploadIcon class="text-muted-foreground size-4" />
							<span class="text-muted-foreground text-sm">Drop or click to upload</span>
							<input type="file" accept="image/*" class="hidden" onchange={handleReferenceUpload} />
						</label>
					{/if}
				</div>
				{/if}

				<!-- Prompt -->
				<div class="flex flex-col gap-2">
					<label for="studio-prompt" class="text-sm font-medium">Prompt</label>
					<textarea
						id="studio-prompt"
						class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring field-sizing-content max-h-72 min-h-[120px] resize-none rounded-lg border px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						placeholder={isVideoMode ? 'Describe the video you want to create...' : 'Describe the image you want to create...'}
						bind:value={prompt}
						onkeydown={handleKeydown}
					></textarea>
				</div>

				<!-- Error -->
				{#if errorMessage}
					<div class="bg-destructive/10 text-destructive rounded-lg px-3 py-2.5 text-sm">
						{errorMessage}
					</div>
				{/if}

				<!-- Generate Button -->
				<Button
					class="h-11 w-full gap-2 text-sm font-semibold"
					disabled={!prompt.trim() || !selectedModelId || isGenerating}
					onclick={generate}
				>
					{#if isGenerating}
						<LoaderCircleIcon class="size-4 animate-spin" />
						Generating...
					{:else}
						<SparklesIcon class="size-4" />
						Generate
					{/if}
				</Button>

				<p class="text-muted-foreground text-center text-xs">
					{#if isGenerating}
						This may take a few seconds...
					{:else}
						<kbd class="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> to generate,
						<kbd class="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">Shift+Enter</kbd> for a new line
					{/if}
				</p>
			</div>
		</div>

		<!-- Right Panel: Generated Images -->
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			{#if generations.length === 0 && !isGenerating}
				<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
					<div class="bg-muted/50 rounded-2xl p-6">
						{#if isVideoMode}
							<VideoIcon class="text-muted-foreground/50 size-12" />
						{:else}
							<ImageIcon class="text-muted-foreground/50 size-12" />
						{/if}
					</div>
					<div>
						<h2 class="text-lg font-semibold">No {isVideoMode ? 'videos' : 'images'} yet</h2>
						<p class="text-muted-foreground mt-1 max-w-sm text-sm">
							Choose a model, write a prompt, and press Enter to start creating {isVideoMode ? 'videos' : 'images'}.
						</p>
					</div>
					{#if currentModel?.examplePrompt}
						<button
							type="button"
							class="border-border hover:bg-accent/50 max-w-md rounded-xl border px-4 py-3 text-left transition-colors"
							onclick={useExamplePrompt}
						>
							<span class="text-muted-foreground block text-xs">Try an example for {currentModel.name}</span>
							<span class="mt-1 line-clamp-3 text-sm">{currentModel.examplePrompt}</span>
						</button>
					{/if}
				</div>
			{:else}
				<div class="flex-1 overflow-y-auto p-6">
					{#if isGenerating}
						<div class="mb-6">
							<div class="border-primary/20 bg-primary/5 flex items-center gap-3 rounded-xl border p-4">
								<LoaderCircleIcon class="text-primary size-5 animate-spin" />
								<div>
									<p class="text-sm font-medium">{generationStatus || (isVideoMode ? 'Generating your video...' : 'Generating your image...')}</p>
									<p class="text-muted-foreground text-xs">{currentModel?.name} &middot; "{prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt}"</p>
								</div>
							</div>
						</div>
					{/if}

					{#if errorMessage}
						<div class="bg-destructive/10 text-destructive mb-6 rounded-lg px-3 py-2.5 text-sm">
							{errorMessage}
						</div>
					{/if}

					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{#each generations as image, index (image.url)}
							<div class="group border-border bg-card overflow-hidden rounded-xl border transition-shadow hover:shadow-lg">
								{#if image.kind === 'video'}
									<!-- svelte-ignore a11y_media_has_caption -->
									<video src={image.url} controls preload="metadata" class="aspect-video w-full bg-black"></video>
								{:else}
									<button
										type="button"
										class="relative block w-full cursor-zoom-in overflow-hidden"
										onclick={() => openLightbox(image)}
									>
										<img
											src={image.url}
											alt={image.prompt}
											class="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
											loading="lazy"
										/>
										<div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
										<div class="absolute right-2 bottom-2 left-2 flex translate-y-2 items-center justify-between opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
											<span class="rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
												{image.modelName}
											</span>
											<div class="flex gap-1">
												<a
													href={image.url}
													target="_blank"
													rel="noreferrer"
													class="rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
													onclick={(e) => e.stopPropagation()}
												>
													<ExternalLinkIcon class="size-3.5" />
												</a>
												<a
													href={image.url}
													download={image.fileName}
													class="rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
													onclick={(e) => e.stopPropagation()}
												>
													<DownloadIcon class="size-3.5" />
												</a>
											</div>
										</div>
									</button>
								{/if}

								<div class="px-3 py-2.5">
									<p class="line-clamp-2 text-sm leading-snug">{image.prompt}</p>
									<div class="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
										<span>{new Date(image.timestamp).toLocaleTimeString()}</span>
										<div class="flex items-center gap-2">
											{#if image.cost > 0}
												<span>${image.cost.toFixed(4)}</span>
											{/if}
											<button
												type="button"
												class="hover:text-foreground transition-colors"
												onclick={() => copyPrompt(index, image.prompt)}
											>
												{#if copiedPromptIndex === index}
													<CheckIcon class="size-3.5" />
												{:else}
													<CopyIcon class="size-3.5" />
												{/if}
											</button>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Settings Modal -->
<Modal bind:open={settingsOpen}>
	<div class="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-1">
		<div class="mb-2 flex items-center gap-2 border-b pb-3">
			<div class="bg-primary/10 text-primary rounded-lg p-2">
				<SettingsIcon class="size-5" />
			</div>
			<div>
				<h3 class="font-medium">{isVideoMode ? 'Video' : 'Image'} Settings</h3>
				<p class="text-muted-foreground text-xs">{currentModel?.name ?? 'No model'}</p>
			</div>
		</div>

		{#if currentModel}
			{#if currentModel.resolutions && currentModel.resolutions.length > 0}
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">
						Resolution
						<span class="text-muted-foreground ml-1 text-xs font-normal">(Output size)</span>
					</label>
					<select
						class="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus:ring-1 focus:outline-none"
						bind:value={imageParams.resolution}
					>
						{#each currentModel.resolutions as res}
							<option value={res.value}>{res.value} - {res.comment}</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if currentModel.maxImages && currentModel.maxImages > 1}
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">
						Number of Images
						<span class="text-muted-foreground ml-1 text-xs font-normal">(1-{currentModel.maxImages})</span>
					</label>
					<select
						class="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus:ring-1 focus:outline-none"
						bind:value={imageParams.nImages}
					>
						{#each Array.from({ length: currentModel.maxImages }, (_, i) => i + 1) as n}
							<option value={n}>{n}</option>
						{/each}
					</select>
				</div>
			{/if}

			{#each normalizedParams as param (param.key)}
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">
						{param.label}
						{#if param.description}
							<span class="text-muted-foreground ml-1 text-xs font-normal">({param.description})</span>
						{/if}
					</label>

					{#if param.type === 'select' && param.options}
						<select
							class="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus:ring-1 focus:outline-none"
							bind:value={imageParams[param.key]}
						>
							{#each param.options as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					{:else if param.type === 'boolean' || param.type === 'switch'}
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								class="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300"
								bind:checked={imageParams[param.key]}
							/>
							<span class="text-muted-foreground text-sm">Enabled</span>
						</div>
					{:else if param.type === 'number'}
						<Input type="number" bind:value={imageParams[param.key]} />
					{:else}
						<Input type="text" bind:value={imageParams[param.key]} />
					{/if}
				</div>
			{/each}

			{#if normalizedParams.length === 0 && (!currentModel.resolutions || currentModel.resolutions.length === 0)}
				<div class="text-muted-foreground p-4 text-center text-sm">
					No configurable settings for this model.
				</div>
			{/if}
		{/if}

		<div class="flex justify-end pt-2">
			<Button onclick={() => (settingsOpen = false)}>Done</Button>
		</div>
	</div>
</Modal>

<!-- Lightbox Modal -->
<Modal bind:open={lightboxOpen}>
	{#if lightboxImage}
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<div class="min-w-0 flex-1">
					<h3 class="truncate text-sm font-medium">{lightboxImage.modelName}</h3>
				</div>
				<div class="flex items-center gap-1.5">
					<a
						href={lightboxImage.url}
						download={lightboxImage.fileName}
						class="hover:bg-accent rounded-md p-1.5 transition-colors"
					>
						<DownloadIcon class="size-4" />
					</a>
					<a
						href={lightboxImage.url}
						target="_blank"
						rel="noreferrer"
						class="hover:bg-accent rounded-md p-1.5 transition-colors"
					>
						<ExternalLinkIcon class="size-4" />
					</a>
					<button
						type="button"
						class="hover:bg-accent rounded-md p-1.5 transition-colors"
						onclick={() => (lightboxOpen = false)}
					>
						<XIcon class="size-4" />
					</button>
				</div>
			</div>
			{#if lightboxImage.kind === 'video'}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video src={lightboxImage.url} controls autoplay class="max-h-[70vh] w-full rounded-lg bg-black"></video>
			{:else}
				<img
					src={lightboxImage.url}
					alt={lightboxImage.prompt}
					class="max-h-[70vh] w-full rounded-lg object-contain"
				/>
			{/if}
			<div class="bg-muted/50 rounded-lg px-3 py-2">
				<p class="text-sm">{lightboxImage.prompt}</p>
				<div class="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
					<span>{new Date(lightboxImage.timestamp).toLocaleString()}</span>
					{#if lightboxImage.cost > 0}
						<span>${lightboxImage.cost.toFixed(4)}</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</Modal>

{#snippet modeSwitch(compact: boolean = false)}
	<div
		class={cn(
			'border-input bg-background flex shrink-0 items-center rounded-lg border p-0.5',
			compact ? 'h-8 text-xs' : 'ml-auto h-9 text-sm'
		)}
		role="tablist"
		aria-label="Studio mode"
	>
		<button
			type="button"
			role="tab"
			aria-selected={!isVideoMode}
			class={cn(
				'flex h-full items-center gap-1.5 rounded-md px-2.5 transition-colors',
				!isVideoMode ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
			)}
			onclick={() => switchMode('image')}
			disabled={isGenerating}
			title="Image mode"
		>
			<ImageIcon class="size-4" />
			{#if !compact}<span>Image</span>{/if}
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={isVideoMode}
			class={cn(
				'flex h-full items-center gap-1.5 rounded-md px-2.5 transition-colors',
				isVideoMode ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
			)}
			onclick={() => switchMode('video')}
			disabled={isGenerating}
			title="Video mode"
		>
			<VideoIcon class="size-4" />
			{#if !compact}<span>Video</span>{/if}
		</button>
	</div>
{/snippet}
