<script lang="ts">
	import { usePrompt } from '$lib/state/prompt.svelte';
	import { cn } from '$lib/utils/utils';

	type Props = {
		suggestions: string[];
		class?: string;
	};

	let { suggestions, class: className = '' }: Props = $props();

	const prompt = usePrompt();

	function handleSuggestionClick(question: string) {
		prompt.current = question;
	}
</script>

<div class={cn('mt-3 flex flex-wrap gap-2', className)}>
	{#each suggestions as suggestion (suggestion)}
		<button
			type="button"
			class="bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border-border rounded-lg border px-4 py-2 text-sm transition-all"
			onclick={() => handleSuggestionClick(suggestion)}
		>
			{suggestion}
		</button>
	{/each}
</div>
