<script lang="ts">
	import { cn } from '$lib/utils/utils';
	import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import CheckIcon from '~icons/lucide/check';
	import SearchIcon from '~icons/lucide/search';
	import ImageIcon from '~icons/lucide/image';
	import ImagePlusIcon from '~icons/lucide/image-plus';
	import TicketIcon from '~icons/lucide/ticket';
	import XIcon from '~icons/lucide/x';

	type Mode = 'all' | 'text-to-image' | 'image-to-image';
	type Sort = 'newest' | 'price' | 'name';

	let {
		models,
		value = $bindable(''),
		compact = false,
		class: className,
	}: {
		models: NanoGPTModel[];
		value: string;
		/** Small trigger for the mobile bottom bar. */
		compact?: boolean;
		class?: string;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let search = $state('');
	let mode = $state<Mode>('all');
	let vendor = $state('all');
	let subscriptionOnly = $state(false);
	let sort = $state<Sort>('newest');
	let searchInput = $state<HTMLInputElement | null>(null);

	const NEW_DAYS = 45;

	/** Cheapest resolution, in USD per image. Pricing arrives as a JSON string keyed by size. */
	function minCost(m: NanoGPTModel): number | null {
		if (!m.pricing?.image) return null;
		try {
			const costs = Object.values(JSON.parse(m.pricing.image) as Record<string, unknown>).filter(
				(c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0
			);
			return costs.length ? Math.min(...costs) : null;
		} catch {
			return null;
		}
	}

	function formatCost(c: number | null) {
		if (c === null) return null;
		return `$${c < 0.01 ? c.toFixed(4) : c.toFixed(3)}`;
	}

	function isNew(m: NanoGPTModel) {
		if (m.label === 'NEW') return true;
		if (!m.dateAdded) return false;
		const added = new Date(m.dateAdded).getTime();
		return Number.isFinite(added) && Date.now() - added < NEW_DAYS * 86_400_000;
	}

	function vendorLabel(v: string | undefined) {
		if (!v || v === 'other') return null;
		return v.charAt(0).toUpperCase() + v.slice(1);
	}

	const current = $derived(models.find((m) => m.id === value) ?? null);
	const vendors = $derived(
		[
			...new Set(models.map((m) => m.vendor).filter((v): v is string => !!v && v !== 'other')),
		].sort()
	);

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const rows = models.filter((m) => {
			if (mode === 'text-to-image' && m.mode === 'image-to-image') return false;
			if (mode === 'image-to-image' && !m.supportsImageInput) return false;
			if (vendor !== 'all' && m.vendor !== vendor) return false;
			if (subscriptionOnly && !m.subscription?.included) return false;
			if (q) {
				const haystack = [m.name, m.id, m.vendor ?? '', ...(m.tags ?? [])].join(' ').toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			return true;
		});
		const cost = new Map(rows.map((m) => [m.id, minCost(m)]));
		return rows.sort((a, b) => {
			if (sort === 'name') return a.name.localeCompare(b.name);
			if (sort === 'price') {
				const ca = cost.get(a.id) ?? Infinity;
				const cb = cost.get(b.id) ?? Infinity;
				return ca - cb || a.name.localeCompare(b.name);
			}
			return (b.created ?? 0) - (a.created ?? 0) || a.name.localeCompare(b.name);
		});
	});

	const activeFilterCount = $derived(
		(mode !== 'all' ? 1 : 0) + (vendor !== 'all' ? 1 : 0) + (subscriptionOnly ? 1 : 0)
	);

	// The dialog is driven directly: showModal/close here, no prop round trip, so
	// closing cannot depend on a re-render that a parent update might swallow.
	function openPicker() {
		if (!dialog || dialog.open) return;
		dialog.showModal();
		setTimeout(() => searchInput?.focus(), 0);
	}

	function closePicker() {
		if (dialog?.open) dialog.close();
	}

	function select(id: string) {
		value = id;
		closePicker();
	}

	function resetFilters() {
		search = '';
		mode = 'all';
		vendor = 'all';
		subscriptionOnly = false;
	}

	const chip =
		'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors whitespace-nowrap';
	const chipOff = 'border-input bg-background text-muted-foreground hover:bg-accent/50';
	const chipOn = 'border-primary/40 bg-primary/10 text-primary';
	const selectClass =
		'border-input bg-background h-8 rounded-md border px-2 text-xs focus:outline-none';
</script>

<button
	type="button"
	class={cn(
		'border-input bg-background hover:bg-accent/50 flex w-full items-center justify-between gap-2 rounded-lg border text-left transition-colors',
		compact ? 'h-8 px-2.5 text-xs' : 'h-10 px-3 text-sm',
		className
	)}
	onclick={openPicker}
>
	<span class="flex min-w-0 items-center gap-2">
		{#if !compact}
			{#if current?.exampleImage}
				<img src={current.exampleImage} alt="" class="size-6 shrink-0 rounded object-cover" />
			{:else}
				<ImageIcon class="text-muted-foreground size-4 shrink-0" />
			{/if}
		{/if}
		<span class="truncate">{current?.name ?? 'Select a model...'}</span>
		{#if !compact && current}
			{@const cost = formatCost(minCost(current))}
			{#if cost}
				<span class="text-muted-foreground shrink-0 text-xs">from {cost}</span>
			{/if}
		{/if}
	</span>
	<ChevronDownIcon class="text-muted-foreground size-4 shrink-0" />
</button>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	class="modal"
	bind:this={dialog}
	onclick={(e) => {
		// Only the backdrop is the dialog element itself; content clicks hit descendants.
		if (e.target === dialog) closePicker();
	}}
>
	<div class="modal-box max-w-3xl">
		<div class="flex max-h-[80vh] w-full flex-col gap-3">
			<div class="flex items-center gap-2">
				<h3 class="font-medium">Choose a model</h3>
				<span class="text-muted-foreground text-xs">{filtered.length} of {models.length}</span>
				<button
					type="button"
					class="hover:bg-accent text-muted-foreground hover:text-foreground ml-auto rounded-md p-1.5 transition-colors"
					aria-label="Close"
					onclick={closePicker}
				>
					<XIcon class="size-4" />
				</button>
			</div>

			<div class="relative">
				<SearchIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
				<input
					bind:this={searchInput}
					bind:value={search}
					type="search"
					placeholder="Search by name, vendor, or tag"
					class="border-input bg-background placeholder:text-muted-foreground focus:ring-ring h-10 w-full rounded-lg border pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
					onkeydown={(e) => {
						if (e.key === 'Enter' && filtered[0]) select(filtered[0].id);
					}}
				/>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<div class="border-input flex h-8 items-center rounded-md border p-0.5 text-xs">
					{#each [['all', 'All'], ['text-to-image', 'Text to image'], ['image-to-image', 'Image input']] as [id, label] (id)}
						<button
							type="button"
							class={cn(
								'h-full rounded px-2.5 transition-colors',
								mode === id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground'
							)}
							onclick={() => (mode = id as Mode)}
						>
							{label}
						</button>
					{/each}
				</div>
				<select class={selectClass} bind:value={vendor} aria-label="Vendor">
					<option value="all">All vendors</option>
					{#each vendors as v (v)}
						<option value={v}>{vendorLabel(v)}</option>
					{/each}
				</select>
				<button
					type="button"
					class={cn(chip, subscriptionOnly ? chipOn : chipOff)}
					onclick={() => (subscriptionOnly = !subscriptionOnly)}
				>
					<TicketIcon class="size-3.5" />
					Subscription
				</button>
				<select class={cn(selectClass, 'ml-auto')} bind:value={sort} aria-label="Sort">
					<option value="newest">Newest first</option>
					<option value="price">Cheapest first</option>
					<option value="name">Name</option>
				</select>
				{#if activeFilterCount > 0 || search}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
						onclick={resetFilters}
					>
						<XIcon class="size-3.5" /> Clear
					</button>
				{/if}
			</div>

			<div
				class="border-border divide-border -mx-1 min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border"
			>
				{#each filtered as model (model.id)}
					{@const selected = model.id === value}
					{@const cost = formatCost(minCost(model))}
					{@const vendorName = vendorLabel(model.vendor)}
					<button
						type="button"
						class={cn(
							'hover:bg-accent/60 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
							selected && 'bg-accent'
						)}
						onclick={() => select(model.id)}
					>
						{#if model.exampleImage}
							<img
								src={model.exampleImage}
								alt=""
								loading="lazy"
								class="size-12 shrink-0 rounded-md object-cover"
							/>
						{:else}
							<div
								class="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md"
							>
								<ImageIcon class="size-5" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class={cn('truncate text-sm', selected && 'font-medium')}>{model.name}</span>
								{#if isNew(model)}
									<span
										class="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
									>
										New
									</span>
								{/if}
								{#if model.subscription?.included}
									<span
										class="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 uppercase"
									>
										<TicketIcon class="size-3" /> Subscription
									</span>
								{/if}
								{#if model.supportsImageInput}
									<span
										class="bg-muted text-muted-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
										title="Accepts a reference image"
									>
										<ImagePlusIcon class="size-3" /> Image input
									</span>
								{/if}
							</div>
							<div class="text-muted-foreground flex items-center gap-1.5 text-xs">
								{#if vendorName}<span>{vendorName}</span><span>·</span>{/if}
								{#if cost}<span>from {cost}/image</span><span>·</span>{/if}
								<span class="truncate">{model.description || model.id}</span>
							</div>
						</div>
						{#if selected}
							<CheckIcon class="text-primary size-4 shrink-0" />
						{/if}
					</button>
				{:else}
					<div
						class="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm"
					>
						<p>No models match.</p>
						<button
							type="button"
							class="text-primary text-xs hover:underline"
							onclick={resetFilters}
						>
							Clear search and filters
						</button>
					</div>
				{/each}
			</div>
		</div>
	</div>
</dialog>
