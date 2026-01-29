<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import type { Prompt } from '$lib/api';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Modal from '$lib/components/ui/modal/modal.svelte';
	import { substitutePromptVariables } from '$lib/utils/prompt-variables';
	import { shortcut, getKeybindOptions } from '$lib/actions/shortcut.svelte';
	import { tick } from 'svelte';
	import Variable from '~icons/lucide/variable';
	import ArrowLeft from '~icons/lucide/arrow-left';
	import Check from '~icons/lucide/check';

	interface Props {
		open: boolean;
		onApply: (content: string, prompt: Prompt) => void;
	}

	let { open = $bindable(false), onApply }: Props = $props();

	let searchTerm = $state('');
	let selectedIndex = $state(0);
	let step = $state<'select' | 'variables'>('select');
	let selectedPrompt = $state<Prompt | null>(null);
	let variableValues = $state<Record<string, string>>({});

	const promptsQuery = useCachedQuery<Prompt[]>(api.prompts.list, {});

	const filteredPrompts = $derived(
		(promptsQuery.data ?? []).filter(
			(p) =>
				p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				(p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
		)
	);

	// Reset state when modal opens/closes
	$effect(() => {
		if (!open) {
			searchTerm = '';
			selectedIndex = 0;
			step = 'select';
			selectedPrompt = null;
			variableValues = {};
		}
	});

	// Reset selected index when search changes
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		searchTerm;
		selectedIndex = 0;
	});

	function selectPrompt(prompt: Prompt) {
		selectedPrompt = prompt;
		const vars = prompt.variables ?? [];
		if (vars.length > 0) {
			// Initialize with default values
			variableValues = {};
			for (const v of vars) {
				variableValues[v.name] = v.defaultValue ?? '';
			}
			step = 'variables';
		} else {
			applyPrompt(prompt);
		}
	}

	function applyPrompt(prompt: Prompt) {
		const content = substitutePromptVariables(prompt.content, variableValues);
		onApply(content, prompt);
		open = false;
	}

	function goBack() {
		step = 'select';
		selectedPrompt = null;
		variableValues = {};
	}

	function handleKeydown(event: KeyboardEvent) {
		if (step === 'variables') {
			if (event.key === 'Escape') {
				event.preventDefault();
				goBack();
			} else if (event.key === 'Enter' && event.ctrlKey && selectedPrompt) {
				event.preventDefault();
				applyPrompt(selectedPrompt);
			}
			return;
		}

		if (!filteredPrompts.length) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredPrompts.length - 1);
				scrollToSelected();
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				scrollToSelected();
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < filteredPrompts.length) {
					const prompt = filteredPrompts[selectedIndex];
					if (prompt) {
						selectPrompt(prompt);
					}
				}
				break;
			case 'Escape':
				event.preventDefault();
				open = false;
				break;
		}
	}

	async function scrollToSelected() {
		await tick();
		const selectedElement = document.querySelector(`[data-prompt-index="${selectedIndex}"]`);
		if (selectedElement) {
			selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	function handleVariableKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && selectedPrompt) {
			event.preventDefault();
			applyPrompt(selectedPrompt);
		}
	}
</script>

<svelte:window use:shortcut={getKeybindOptions('openPromptPicker', () => (open = true))} />

<Modal bind:open>
	<div class="space-y-4" onkeydown={handleKeydown}>
		{#if step === 'select'}
			<h2 class="text-lg font-semibold">Insert Prompt</h2>

			<input
				bind:value={searchTerm}
				class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
				placeholder="Search prompts..."
				{@attach (node) => {
					if (!open || step !== 'select') return;
					setTimeout(() => {
						if (open && step === 'select') node.focus();
					}, 50);
				}}
			/>

			{#if promptsQuery.isLoading}
				<div class="flex justify-center py-8">
					<div
						class="size-6 animate-spin rounded-full border-2 border-current border-t-transparent"
					></div>
				</div>
			{:else if filteredPrompts.length}
				<div class="max-h-80 space-y-2 overflow-y-auto">
					{#each filteredPrompts as prompt, index (prompt.id)}
						<div
							data-prompt-index={index}
							class="border-border flex cursor-pointer items-start justify-between gap-2 rounded-lg border px-3 py-2 transition-colors {index ===
							selectedIndex
								? 'bg-accent'
								: 'hover:bg-muted/50'}"
							role="button"
							tabindex="0"
							onclick={() => selectPrompt(prompt)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									selectPrompt(prompt);
								}
							}}
							onmouseenter={() => (selectedIndex = index)}
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<div class="truncate font-medium">{prompt.name}</div>
									{#if prompt.variables && prompt.variables.length > 0}
										<span class="bg-primary/10 text-primary flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs">
											<Variable class="size-3" />
											{prompt.variables.length}
										</span>
									{/if}
								</div>
								{#if prompt.description}
									<div class="text-muted-foreground mt-0.5 truncate text-xs">
										{prompt.description}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else if searchTerm.trim()}
				<div class="text-muted-foreground py-8 text-center">
					<p>No prompts found for "{searchTerm}"</p>
					<p class="mt-1 text-xs">Try a different search term</p>
				</div>
			{:else if promptsQuery.data?.length === 0}
				<div class="text-muted-foreground py-8 text-center">
					<p>No prompts yet</p>
					<p class="mt-1 text-xs">
						<a href="/account/prompts?create=true" class="text-primary hover:underline">
							Create your first prompt
						</a>
					</p>
				</div>
			{:else}
				<div class="text-muted-foreground py-8 text-center">
					<p>Start typing to search your prompts</p>
					<p class="mt-1 text-xs">Use arrow keys to navigate, Enter to select, Esc to close</p>
				</div>
			{/if}
		{:else if step === 'variables' && selectedPrompt}
			<div class="flex items-center gap-2">
				<Button variant="ghost" size="icon" class="size-8" onclick={goBack}>
					<ArrowLeft class="size-4" />
				</Button>
				<h2 class="text-lg font-semibold">{selectedPrompt.name}</h2>
			</div>

			{#if selectedPrompt.description}
				<p class="text-muted-foreground text-sm">{selectedPrompt.description}</p>
			{/if}

			<div class="space-y-4">
				{#each selectedPrompt.variables ?? [] as variable, index (variable.name)}
					<div class="space-y-2">
						<Label for={`var-${variable.name}`} class="text-sm font-medium">
							{variable.name}
							{#if variable.description}
								<span class="text-muted-foreground ml-1 font-normal">
									- {variable.description}
								</span>
							{/if}
						</Label>
						<Input
							id={`var-${variable.name}`}
							bind:value={variableValues[variable.name]}
							placeholder={variable.defaultValue || `Enter ${variable.name}...`}
							onkeydown={handleVariableKeydown}
							{@attach (node) => {
								if (index === 0 && step === 'variables') {
									setTimeout(() => node.focus(), 50);
								}
							}}
						/>
					</div>
				{/each}
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<Button variant="ghost" onclick={goBack}>Back</Button>
				<Button onclick={() => applyPrompt(selectedPrompt!)}>
					<Check class="mr-2 size-4" />
					Apply Prompt
				</Button>
			</div>

			<p class="text-muted-foreground text-center text-xs">
				Press Enter to apply, Esc to go back
			</p>
		{/if}
	</div>
</Modal>
