<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { cn } from '$lib/utils/utils';
	import ThumbsUpIcon from '~icons/lucide/thumbs-up';
	import ThumbsDownIcon from '~icons/lucide/thumbs-down';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import StarIcon from '~icons/lucide/star';

	type Props = {
		messageId: string;
		initialRating?: {
			thumbs?: 'up' | 'down';
			rating?: number;
			categories?: string[];
			feedback?: string;
		};
		onRate?: (data: {
			thumbs?: 'up' | 'down';
			rating?: number;
			categories?: string[];
			feedback?: string;
		}) => Promise<void>;
	};

	let { messageId, initialRating, onRate }: Props = $props();

	// svelte-ignore state_referenced_locally
	let thumbs = $state<'up' | 'down' | undefined>(initialRating?.thumbs);
	// svelte-ignore state_referenced_locally
	let starRating = $state<number | undefined>(initialRating?.rating);
	// svelte-ignore state_referenced_locally
	let selectedCategories = $state<string[]>(initialRating?.categories || []);
	// svelte-ignore state_referenced_locally
	let feedback = $state<string>(initialRating?.feedback || '');

	// Saved ratings are fetched, so `initialRating` usually arrives after this
	// component has mounted — the $state above would otherwise keep its empty
	// starting value forever. Once the user touches the widget their input wins, so
	// a late-arriving fetch cannot overwrite what they are in the middle of doing.
	let hasLocalEdit = $state(false);

	$effect(() => {
		const incoming = initialRating;
		if (hasLocalEdit) return;

		thumbs = incoming?.thumbs;
		starRating = incoming?.rating;
		selectedCategories = incoming?.categories ?? [];
		feedback = incoming?.feedback ?? '';
	});
	let showDetailedFeedback = $state(false);
	let isSubmitting = $state(false);

	const categories = ['Accurate', 'Helpful', 'Creative', 'Fast', 'Cost-effective'];

	async function handleThumbsClick(value: 'up' | 'down') {
		const newValue = thumbs === value ? undefined : value;
		hasLocalEdit = true;
		thumbs = newValue;

		if (onRate) {
			isSubmitting = true;
			try {
				await onRate({
					thumbs: newValue,
					rating: starRating,
					categories: selectedCategories,
					feedback,
				});
			} finally {
				isSubmitting = false;
			}
		}
	}

	async function submitDetailedRating() {
		hasLocalEdit = true;
		if (onRate) {
			isSubmitting = true;
			try {
				await onRate({
					thumbs,
					rating: starRating,
					categories: selectedCategories,
					feedback,
				});
				showDetailedFeedback = false;
			} finally {
				isSubmitting = false;
			}
		}
	}

	function toggleCategory(category: string) {
		hasLocalEdit = true;
		if (selectedCategories.includes(category)) {
			selectedCategories = selectedCategories.filter((c) => c !== category);
		} else {
			selectedCategories = [...selectedCategories, category];
		}
	}
</script>

<div class="flex items-center gap-2">
	<!-- Thumbs up/down buttons -->
	<Tooltip>
		{#snippet trigger(tooltip)}
			<Button
				size="icon"
				variant="ghost"
				class={cn('size-7', { 'text-green-500': thumbs === 'up' })}
				onclick={() => handleThumbsClick('up')}
				disabled={isSubmitting}
				{...tooltip.trigger}
			>
				<ThumbsUpIcon class="size-4" />
			</Button>
		{/snippet}
		Helpful response
	</Tooltip>

	<Tooltip>
		{#snippet trigger(tooltip)}
			<Button
				size="icon"
				variant="ghost"
				class={cn('size-7', { 'text-red-500': thumbs === 'down' })}
				onclick={() => handleThumbsClick('down')}
				disabled={isSubmitting}
				{...tooltip.trigger}
			>
				<ThumbsDownIcon class="size-4" />
			</Button>
		{/snippet}
		Unhelpful response
	</Tooltip>

	<!-- Toggle detailed feedback -->
	<Tooltip>
		{#snippet trigger(tooltip)}
			<Button
				size="icon"
				variant="ghost"
				class={cn('size-7', { 'rotate-180': showDetailedFeedback })}
				onclick={() => (showDetailedFeedback = !showDetailedFeedback)}
				{...tooltip.trigger}
			>
				<ChevronDownIcon class="size-4 transition-transform" />
			</Button>
		{/snippet}
		{showDetailedFeedback ? 'Hide' : 'Show'} detailed feedback
	</Tooltip>
</div>

<!-- Detailed feedback form -->
{#if showDetailedFeedback}
	<div class="border-border bg-muted/30 mt-2 rounded-lg border p-4">
		<!-- Star rating -->
		<div class="mb-4">
			<span class="text-muted-foreground mb-2 block text-sm">Rating</span>
			<div class="flex gap-1">
				{#each [1, 2, 3, 4, 5] as star}
					<button
						type="button"
						onclick={() => {
							hasLocalEdit = true;
							starRating = starRating === star ? undefined : star;
						}}
						class={cn(
							'transition-colors',
							starRating && star <= starRating ? 'text-yellow-500' : 'text-muted-foreground/30'
						)}
					>
						<StarIcon class="size-6 fill-current" />
					</button>
				{/each}
			</div>
		</div>

		<!-- Categories -->
		<div class="mb-4">
			<span class="text-muted-foreground mb-2 block text-sm">Categories</span>
			<div class="flex flex-wrap gap-2">
				{#each categories as category}
					<button
						type="button"
						onclick={() => toggleCategory(category)}
						class={cn(
							'rounded-md border px-3 py-1 text-sm transition-colors',
							selectedCategories.includes(category)
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-border text-muted-foreground hover:border-primary/50'
						)}
					>
						{category}
					</button>
				{/each}
			</div>
		</div>

		<!-- Text feedback -->
		<div class="mb-4">
			<label for="feedback" class="text-muted-foreground mb-2 block text-sm"
				>Additional feedback (optional)</label
			>
			<textarea
				id="feedback"
				bind:value={feedback}
				placeholder="Share your thoughts..."
				class="bg-background border-border w-full rounded-md border px-3 py-2 text-sm"
				rows="3"></textarea>
		</div>

		<!-- Submit button -->
		<div class="flex justify-end">
			<Button size="sm" onclick={submitDetailedRating} disabled={isSubmitting}>
				{isSubmitting ? 'Submitting...' : 'Submit Feedback'}
			</Button>
		</div>
	</div>
{/if}
