<script lang="ts">
	import { Modal } from '$lib/components/ui/modal';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { models } from '$lib/state/models.svelte';
	import { Provider } from '$lib/types';
	import VideoIcon from '~icons/lucide/video';
	import { untrack } from 'svelte';

	let {
		open = $bindable(false),
		presetModelId = '',
		videoParams = $bindable<Record<string, any>>({}),
	} = $props();

	// Get current model details to show params
	const modelsList = $derived(models.from(Provider.NanoGPT));
	const currentModel = $derived(modelsList.find((m) => m.id === presetModelId));

	// Initialize default params when model changes
	$effect(() => {
		if (currentModel?.additionalParams) {
			const defaults: Record<string, any> = {};
			// Gather defaults
			for (const [key, param] of Object.entries(currentModel.additionalParams)) {
				defaults[key] = param.default;
			}

			untrack(() => {
				// Initialize params if empty or missing keys
				const newParams = { ...defaults, ...videoParams };
				// Ensure defaults exist
				for (const key in defaults) {
					if (newParams[key] === undefined) {
						newParams[key] = defaults[key];
					}
				}
				// Update parent bindable
				Object.assign(videoParams, newParams);
			});
		}
	});
</script>

<Modal bind:open>
	<div class="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-1">
		<div class="mb-2 flex items-center gap-2 border-b pb-2">
			<div class="rounded-lg bg-blue-500/10 p-2 text-blue-500">
				<VideoIcon class="size-5" />
			</div>
			<div>
				<h3 class="font-medium">{currentModel?.name || 'No Video Model'}</h3>
				{#if currentModel}
					<p class="text-muted-foreground text-xs">{currentModel.id}</p>
				{/if}
			</div>
		</div>

		{#if !currentModel}
			<div class="text-muted-foreground p-4 text-center text-sm">
				Please select a video capable model in the chat to configure settings.
			</div>
		{:else if currentModel.additionalParams}
			{#each Object.entries(currentModel.additionalParams) as [key, param]}
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
							bind:value={videoParams[key]}
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
								bind:checked={videoParams[key]}
							/>
							<span class="text-muted-foreground text-sm">Enabled</span>
						</div>
					{:else if param.type === 'number'}
						<Input
							type="number"
							bind:value={videoParams[key]}
							min={(param as any).min}
							max={(param as any).max}
							step={(param as any).step}
						/>
					{:else}
						<Input type="text" bind:value={videoParams[key]} />
					{/if}
				</div>
			{/each}
		{:else}
			<div class="text-muted-foreground p-4 text-center text-sm">
				No configurable settings for this model.
			</div>
		{/if}

		<div class="flex justify-end pt-4">
			<Button variant="default" onclick={() => (open = false)}>Done</Button>
		</div>
	</div>
</Modal>
