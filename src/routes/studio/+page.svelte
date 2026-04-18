<script lang="ts">
	import { models } from '$lib/state/models.svelte';
	import { Provider } from '$lib/types';
	import { isImageOnlyModel } from '$lib/utils/model-capabilities';
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

	const isMobile = new IsMobile();

	// --- Persisted state (survives refresh / tab close) ---
	const STORAGE_KEY = 'studio-preferences';

	function loadPrefs(): { modelId: string; modelSettings: Record<string, Record<string, any>> } {
		try {
			const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
			if (raw) return JSON.parse(raw);
		} catch {}
		return { modelId: '', modelSettings: {} };
	}

	function savePrefs(update: Partial<{ modelId: string; modelSettings: Record<string, Record<string, any>> }>) {
		try {
			const current = loadPrefs();
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...update }));
		} catch {}
	}

	const initialPrefs = loadPrefs();

	// --- State ---
	let prompt = $state('');
	let selectedModelId = $state(initialPrefs.modelId || '');
	let imageParams = $state<Record<string, any>>({});
	let isGenerating = $state(false);
	let errorMessage = $state('');
	let settingsOpen = $state(false);
	let modelPickerOpen = $state(false);
	let lightboxImage = $state<GeneratedImage | null>(null);
	let lightboxOpen = $state(false);
	let referenceImageId = $state<string | null>(null);
	let referenceImageUrl = $state<string | null>(null);
	let copiedPromptIndex = $state<number | null>(null);

	type GeneratedImage = {
		url: string;
		storage_id: string;
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
	const currentModel = $derived(imageModels.find((m) => m.id === selectedModelId) ?? null);

	// Auto-select: persisted model if still valid, otherwise first available
	$effect(() => {
		if (imageModels.length === 0) return;
		if (selectedModelId && imageModels.some((m) => m.id === selectedModelId)) return;
		selectedModelId = imageModels[0]!.id;
	});

	// Persist selected model whenever it changes
	$effect(() => {
		if (selectedModelId) {
			savePrefs({ modelId: selectedModelId });
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

	async function generate() {
		if (!prompt.trim() || !selectedModelId || isGenerating) return;

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
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			generate();
		}
	}

	const hasSettings = $derived(
		(currentModel?.resolutions && currentModel.resolutions.length > 0) ||
			(currentModel?.maxImages && currentModel.maxImages > 1) ||
			normalizedParams.length > 0
	);

	const settingsSummary = $derived.by(() => {
		const parts: string[] = [];
		if (imageParams.resolution) parts.push(imageParams.resolution);
		if (imageParams.nImages && imageParams.nImages > 1) parts.push(`${imageParams.nImages}x`);
		if (imageParams.quality) parts.push(imageParams.quality);
		return parts.join(' / ') || 'Default';
	});
</script>

<svelte:window
	onclick={(e) => {
		if (modelPickerOpen) {
			const target = e.target as HTMLElement;
			if (!target.closest('[data-model-picker]')) {
				modelPickerOpen = false;
			}
		}
	}}
/>

<svelte:head>
	<title>Image Studio - nanochat</title>
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
						<ImageIcon class="text-muted-foreground/50 size-10" />
					</div>
					<div>
						<h2 class="font-semibold">Image Studio</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							Type a prompt below to generate images.
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
									<p class="text-sm font-medium">Generating...</p>
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
						{#each generations as image, index (image.storage_id)}
							<div class="border-border bg-card overflow-hidden rounded-xl border">
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
				<div class="relative flex-1" data-model-picker>
					<button
						type="button"
						class="border-input bg-background flex h-8 w-full items-center justify-between rounded-lg border px-2.5 text-xs"
						onclick={() => (modelPickerOpen = !modelPickerOpen)}
					>
						<span class="truncate">{currentModel?.name ?? 'Model...'}</span>
						<ChevronDownIcon class={cn('text-muted-foreground size-3.5 transition-transform', { 'rotate-180': modelPickerOpen })} />
					</button>
					{#if modelPickerOpen}
						<div class="border-border bg-popover absolute bottom-full right-0 left-0 z-50 mb-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg">
							{#each imageModels as model (model.id)}
								<button
									type="button"
									class={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', { 'bg-accent font-medium': model.id === selectedModelId })}
									onclick={() => { selectedModelId = model.id; modelPickerOpen = false; }}
								>
									<span class="truncate">{model.name}</span>
									{#if model.id === selectedModelId}
										<CheckIcon class="text-primary ml-auto size-3.5 shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>

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

				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="border-input bg-background flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs">
					<UploadIcon class="text-muted-foreground size-3.5" />
					<input type="file" accept="image/*" class="hidden" onchange={handleReferenceUpload} />
				</label>
			</div>

			<!-- Prompt + send -->
			<div class="flex items-end gap-2 pb-2">
				<textarea
					class="border-input bg-background placeholder:text-muted-foreground min-h-[40px] max-h-[100px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm leading-snug outline-none"
					placeholder="Describe your image..."
					bind:value={prompt}
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
					<h1 class="text-lg font-semibold tracking-tight">Image Studio</h1>
					<p class="text-muted-foreground text-xs">Create images with AI</p>
				</div>
			</div>

			<div class="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
				<!-- Model Selector -->
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">Model</label>
					<div class="relative" data-model-picker>
						<button
							type="button"
							class="border-input bg-background hover:bg-accent/50 flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors"
							onclick={() => (modelPickerOpen = !modelPickerOpen)}
						>
							<span class="truncate">{currentModel?.name ?? 'Select a model...'}</span>
							<ChevronDownIcon class={cn('text-muted-foreground size-4 transition-transform', { 'rotate-180': modelPickerOpen })} />
						</button>
						{#if modelPickerOpen}
							<div class="border-border bg-popover absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg">
								{#each imageModels as model (model.id)}
									<button
										type="button"
										class={cn(
											'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
											{ 'bg-accent font-medium': model.id === selectedModelId }
										)}
										onclick={() => { selectedModelId = model.id; modelPickerOpen = false; }}
									>
										<ImageIcon class={cn('size-4 shrink-0', { 'text-primary': model.id === selectedModelId, 'text-muted-foreground': model.id !== selectedModelId })} />
										<div class="min-w-0 flex-1">
											<div class="truncate">{model.name}</div>
											<div class="text-muted-foreground truncate text-xs">{model.id}</div>
										</div>
										{#if model.id === selectedModelId}
											<CheckIcon class="text-primary size-4 shrink-0" />
										{/if}
									</button>
								{/each}
								{#if imageModels.length === 0}
									<div class="text-muted-foreground p-4 text-center text-sm">No image models available.</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>

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
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">Reference Image <span class="text-muted-foreground font-normal">(optional)</span></label>
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

				<!-- Prompt -->
				<div class="flex flex-1 flex-col gap-2">
					<label for="studio-prompt" class="text-sm font-medium">Prompt</label>
					<textarea
						id="studio-prompt"
						class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-[120px] flex-1 resize-none rounded-lg border px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						placeholder="Describe the image you want to create..."
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
						Press <kbd class="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">{navigator?.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter</kbd> to generate
					{/if}
				</p>
			</div>
		</div>

		<!-- Right Panel: Generated Images -->
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			{#if generations.length === 0 && !isGenerating}
				<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
					<div class="bg-muted/50 rounded-2xl p-6">
						<ImageIcon class="text-muted-foreground/50 size-12" />
					</div>
					<div>
						<h2 class="text-lg font-semibold">No images yet</h2>
						<p class="text-muted-foreground mt-1 max-w-sm text-sm">
							Choose a model, write a prompt, and hit Generate to start creating images.
						</p>
					</div>
				</div>
			{:else}
				<div class="flex-1 overflow-y-auto p-6">
					{#if isGenerating}
						<div class="mb-6">
							<div class="border-primary/20 bg-primary/5 flex items-center gap-3 rounded-xl border p-4">
								<LoaderCircleIcon class="text-primary size-5 animate-spin" />
								<div>
									<p class="text-sm font-medium">Generating your image...</p>
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
						{#each generations as image, index (image.storage_id)}
							<div class="group border-border bg-card overflow-hidden rounded-xl border transition-shadow hover:shadow-lg">
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
				<h3 class="font-medium">Image Settings</h3>
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
			<img
				src={lightboxImage.url}
				alt={lightboxImage.prompt}
				class="max-h-[70vh] w-full rounded-lg object-contain"
			/>
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
