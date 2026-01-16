<script lang="ts">
	import { session } from '$lib/state/session.svelte';
	import IconAi from '~icons/lucide/sparkles';
	import CodeIcon from '~icons/lucide/code';
	import GraduationCapIcon from '~icons/lucide/graduation-cap';
	import NewspaperIcon from '~icons/lucide/newspaper';
	import { Button } from '$lib/components/ui/button';
	import { usePrompt } from '$lib/state/prompt.svelte';
	import { scale } from 'svelte/transition';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { Provider } from '$lib/types';
	import { page } from '$app/state';

	const defaultSuggestions = [
		'How does AI work?',
		'Are black holes real?',
		'How many Rs are in the word "strawberry"?',
		'What is the meaning of life?',
	];

	const settings = useCachedQuery(api.user_settings.get, {
		session_token: session.current?.session.token ?? '',
	});

	const suggestionCategories: Record<string, { icon: typeof IconAi; suggestions: string[] }> = {
		Create: {
			icon: IconAi,
			suggestions: [
				'Write a short story about discovering emotions',
				'Help me outline a sci-fi novel set in a post-post-apocalyptic world',
				'Create a character profile for a complex villain with sympathetic motives',
				'Give me 5 creative writing prompts for flash fiction',
			],
		},
		Explore: {
			icon: NewspaperIcon,
			suggestions: [
				'Good books for fans of Rick Rubin',
				'Countries ranked by number of corgis',
				'Most successful companies in the world',
				'How much does Claude cost?',
			],
		},
		Code: {
			icon: CodeIcon,
			suggestions: [
				'Write code to invert a binary search tree in Python',
				"What's the difference between Promise.all and Promise.allSettled?",
				"Explain React's useEffect cleanup function",
				'Best practices for error handling in async/await',
			],
		},
		Learn: {
			icon: GraduationCapIcon,
			suggestions: [
				"Beginner's guide to TypeScript",
				'Explain the CAP theorem in distributed systems',
				'Why is AI so expensive?',
				'Are black holes real?',
			],
		},
	};

	let selectedCategory = $state<string | null>(null);

	const nanoGPTKeyQuery = useCachedQuery(api.user_keys.get, {
		provider: Provider.NanoGPT,
		session_token: session.current?.session.token ?? '',
	});

	const prompt = usePrompt();

	// Handle URL parameter for initial query
	$effect(() => {
		const urlQuery = page.url.searchParams.get('q');
		if (urlQuery && prompt.current === '') {
			prompt.current = decodeURIComponent(urlQuery);
		}
	});
</script>

<svelte:head>
	<title>nanochat</title>
</svelte:head>

<div class="flex h-svh -translate-y-10 flex-col items-center justify-center">
	{#if prompt.current.length === 0 && nanoGPTKeyQuery.data}
		<div class="w-full max-w-2xl px-4 text-center" in:scale={{ duration: 500, start: 0.9 }}>
			<h1 class="mb-8 font-sans text-4xl font-bold tracking-tight">How can I help you?</h1>
			<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
				{#each Object.entries(suggestionCategories) as [category, opts] (category)}
					<button
						type="button"
						class="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/50 bg-secondary/50 border-border hover:bg-secondary relative inline-flex h-10 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full border px-5 py-2 text-sm font-semibold whitespace-nowrap outline-hidden transition-all select-none hover:cursor-pointer focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
						data-active={selectedCategory === category}
						onclick={() => {
							if (selectedCategory === category) {
								selectedCategory = null;
							} else {
								selectedCategory = category;
							}
						}}
					>
						<opts.icon class="size-4" />
						{category}
					</button>
				{/each}
			</div>

			<div class="mt-8 flex w-full flex-col items-center">
				{#if selectedCategory && suggestionCategories[selectedCategory]}
					<div class="divide-border/50 flex w-full max-w-xl flex-col divide-y">
						{#each suggestionCategories[selectedCategory]?.suggestions ?? [] as suggestion (suggestion)}
							<button
								onclick={() => (prompt.current = suggestion)}
								class="text-muted-foreground hover:bg-secondary/30 hover:text-foreground w-full cursor-pointer px-4 py-4 text-center text-base transition-all"
							>
								{suggestion}
							</button>
						{/each}
					</div>
				{:else}
					<div class="divide-border/50 flex w-full max-w-xl flex-col divide-y">
						{#each defaultSuggestions as suggestion}
							<button
								onclick={() => (prompt.current = suggestion)}
								class="text-muted-foreground hover:bg-secondary/30 hover:text-foreground w-full cursor-pointer px-4 py-4 text-center text-base transition-all"
							>
								{suggestion}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else if !nanoGPTKeyQuery.data && !nanoGPTKeyQuery.isLoading}
		<div class="w-full max-w-2xl px-4 py-12 text-center" in:scale={{ duration: 500, start: 0.9 }}>
			<h1 class="mb-4 font-sans text-4xl font-bold tracking-tight">How can I help you?</h1>
			<p class="text-muted-foreground mb-8 text-lg">
				You can send some free messages, or provide a key for limitless access.
			</p>
			<Button href="/account/api-keys" variant="default" size="lg" class="rounded-full px-8">
				Go to settings
			</Button>
		</div>
	{/if}
</div>
