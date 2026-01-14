<script lang="ts">
	import { Modal } from '$lib/components/ui/modal';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { models } from '$lib/state/models.svelte';
	import { Provider } from '$lib/types';
	import { isImageOnlyModel } from '$lib/utils/model-capabilities';
	import ImageIcon from '~icons/lucide/image';
	import { untrack } from 'svelte';

	let {
		open = $bindable(false),
		presetModelId = '',
		imageParams = $bindable<Record<string, any>>({}),
	} = $props();

	// Get current model details to show params
	const modelsList = $derived(models.from(Provider.NanoGPT));
	const currentModel = $derived.by(() => {
		const model = modelsList.find((m) => m.id === presetModelId);
		return model && isImageOnlyModel(model) ? model : null;
	});

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

		const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label : key;
		const description = typeof raw.description === 'string' ? raw.description : undefined;
		const defaultValue = isPrimitive(raw.default) ? raw.default : undefined;

		return {
			key,
			label,
			description,
			type,
			defaultValue,
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

	let paramsReady = $state(false);

	// Initialize default params when model changes
	$effect(() => {
		paramsReady = false;
		if (currentModel) {
			const defaults: Record<string, any> = {};

			for (const param of normalizedParams) {
				let value = param.defaultValue;
				const modelDefault = currentModel.defaultSettings?.[param.key];
				if (value === undefined && isPrimitive(modelDefault)) {
					value = modelDefault;
				}

				if (param.type === 'select' && param.options && param.options.length > 0) {
					if (!param.options.some((option) => option.value === value)) {
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

			// Add default resolution if available
			if (currentModel.resolutions && currentModel.resolutions.length > 0) {
				const defaultResolution =
					typeof currentModel.defaultSettings?.resolution === 'string'
						? currentModel.defaultSettings.resolution
						: currentModel.resolutions[0]?.value;
				if (defaultResolution) {
					defaults.resolution = defaultResolution;
				}
			}

			// Add default nImages if maxImages is available
			if (currentModel.maxImages) {
				const defaultN =
					typeof currentModel.defaultSettings?.nImages === 'number'
						? currentModel.defaultSettings.nImages
						: 1;
				defaults.nImages = defaultN;
			}

			untrack(() => {
				const newParams: Record<string, any> = {};

				for (const param of normalizedParams) {
					const currentValue = imageParams[param.key];
					if (isPrimitive(currentValue)) {
						if (
							param.type === 'select' &&
							param.options &&
							!param.options.some((option) => option.value === currentValue)
						) {
							newParams[param.key] = defaults[param.key];
						} else {
							newParams[param.key] = currentValue;
						}
					} else {
						newParams[param.key] = defaults[param.key];
					}
				}

				if (defaults.resolution) {
					const currentResolution = imageParams.resolution;
					const isValidResolution =
						typeof currentResolution === 'string' &&
						currentModel.resolutions?.some((res) => res.value === currentResolution);
					newParams.resolution = isValidResolution ? currentResolution : defaults.resolution;
				}

				if (defaults.nImages) {
					const currentN = imageParams.nImages;
					newParams.nImages = typeof currentN === 'number' ? currentN : defaults.nImages;
				}

				for (const key of Object.keys(imageParams)) {
					if (!(key in newParams)) {
						delete imageParams[key];
					}
				}

				// Update parent bindable
				Object.assign(imageParams, newParams);
				paramsReady = true;
			});
		} else {
			paramsReady = true;
		}
	});
</script>

<Modal bind:open>
	<div class="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-1">
		<div class="mb-2 flex items-center gap-2 border-b pb-2">
			<div class="rounded-lg bg-purple-500/10 p-2 text-purple-500">
				<ImageIcon class="size-5" />
			</div>
			<div>
				<h3 class="font-medium">{currentModel?.name || 'No Image Model'}</h3>
				{#if currentModel}
					<p class="text-muted-foreground text-xs">{currentModel.id}</p>
				{/if}
			</div>
		</div>

		{#if !currentModel}
			<div class="text-muted-foreground p-4 text-center text-sm">
				Please select an image model in the chat to configure settings.
			</div>
		{:else}
			{#if !paramsReady}
				<div class="text-muted-foreground p-4 text-center text-sm">Loading settings...</div>
			{:else}
			<!-- Resolution selector -->
			{#if currentModel.resolutions && currentModel.resolutions.length > 0}
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label
						class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
					>
						Resolution
						<span class="text-muted-foreground ml-2 text-xs font-normal">(Output size)</span>
					</label>
					<select
						class="border-input ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						bind:value={imageParams.resolution}
					>
						{#each currentModel.resolutions as res}
							<option value={res.value}>{res.value} - {res.comment}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Number of images selector -->
			{#if currentModel.maxImages && currentModel.maxImages > 1}
				<div class="flex flex-col gap-2">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label
						class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
					>
						Number of Images
						<span class="text-muted-foreground ml-2 text-xs font-normal">(1-{currentModel.maxImages})</span>
					</label>
					<select
						class="border-input ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						bind:value={imageParams.nImages}
					>
						{#each Array.from({ length: currentModel.maxImages }, (_, i) => i + 1) as n}
							<option value={n}>{n}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Dynamic additional params -->
			{#if normalizedParams.length > 0}
				{#each normalizedParams as param}
					<div class="flex flex-col gap-2">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label
							class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							{param.label}
							{#if param.description}
								<span class="text-muted-foreground ml-2 text-xs font-normal"
									>({param.description})</span
								>
							{/if}
						</label>

						{#if param.type === 'select' && param.options}
							<select
								class="border-input ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								bind:value={imageParams[param.key]}
							>
								{#each param.options as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						{:else if param.type === 'boolean' || param.type === 'switch'}
							<div class="flex items-center space-x-2">
								<input
									type="checkbox"
									class="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300"
									bind:checked={imageParams[param.key]}
								/>
								<span class="text-muted-foreground text-sm">Enabled</span>
							</div>
						{:else if param.type === 'number'}
							<Input
								type="number"
								bind:value={imageParams[param.key]}
								min={(param as any).min}
								max={(param as any).max}
								step={(param as any).step}
							/>
						{:else}
							<Input type="text" bind:value={imageParams[param.key]} />
						{/if}
					</div>
				{/each}
			{/if}

			{#if normalizedParams.length === 0 && (!currentModel.resolutions || currentModel.resolutions.length === 0)}
				<div class="text-muted-foreground p-4 text-center text-sm">
					No configurable settings for this model.
				</div>
			{/if}
			{/if}
		{/if}

		<div class="flex justify-end pt-4">
			<Button variant="default" onclick={() => (open = false)}>Done</Button>
		</div>
	</div>
</Modal>
