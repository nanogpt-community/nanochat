<script lang="ts">
	import type { NanoGPTModel } from '$lib/backend/models/nano-gpt';
	import type { AALLMModel, AAImageModel, AABenchmarkData } from '$lib/types/artificial-analysis';
	import {
		supportsVision,
		supportsReasoning,
		isImageOnlyModel,
		supportsVideo,
	} from '$lib/utils/model-capabilities';
	import { cn } from '$lib/utils/utils';
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import EyeIcon from '~icons/lucide/eye';
	import BrainIcon from '~icons/lucide/brain';
	import ImageIcon from '~icons/lucide/image';
	import VideoIcon from '~icons/lucide/video';
	import XIcon from '~icons/lucide/x';
	import CheckIcon from '~icons/lucide/check';
	import TrendingUpIcon from '~icons/lucide/trending-up';
	import ZapIcon from '~icons/lucide/zap';
	import ExternalLinkIcon from '~icons/lucide/external-link';

	type Props = {
		model: NanoGPTModel;
		iconUrl?: string;
		onClose: () => void;
	};

	let { model, iconUrl, onClose }: Props = $props();

	// Fetch benchmark data
	const benchmarks = useCachedQuery<AABenchmarkData & { available: boolean }>(
		api.artificial_analysis.benchmarks,
		{},
		{ ttl: 60 * 60 * 1000 } // 1 hour cache
	);

	// Normalize model name for matching (remove punctuation, lowercase)
	function normalizeForMatch(str: string): string {
		return str
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
			.trim();
	}

	// Strip common suffixes that don't affect model identity
	function stripSuffixes(str: string): string {
		return str
			.replace(/[-_]?original$/i, '')
			.replace(/[-_]?\d{8}$/i, '') // Remove date suffixes like -20250929
			.trim();
	}

	// Extract model name from ID (e.g., "zai-org/glm-4.7-original" -> "glm-4.7")
	function extractModelName(id: string): string {
		const parts = id.split('/');
		const name = (parts.length > 1 ? parts[parts.length - 1] : id) ?? id;
		return stripSuffixes(name);
	}

	// Extract key tokens from a model name (keeping version numbers together)
	function extractKeyTokens(name: string): Set<string> {
		// First, normalize separators but keep decimal points intact in version numbers
		const normalized = name
			.toLowerCase()
			.replace(/(\d+)\.(\d+)/g, '$1$2') // "4.7" -> "47", "4.5" -> "45"
			.replace(/[^a-z0-9]+/g, ' ');
		const tokens = normalized.split(' ').filter((t) => t.length > 0);
		// Keep all tokens, but filter out very long date-like patterns (8+ digit numbers)
		return new Set(tokens.filter((t) => !/^\d{8,}$/.test(t)));
	}

	// Check if two token sets have significant overlap
	function tokensMatch(set1: Set<string>, set2: Set<string>): boolean {
		if (set1.size === 0 || set2.size === 0) return false;
		let matches = 0;
		for (const token of set1) {
			if (set2.has(token)) matches++;
		}
		// Require at least 2 matching tokens to prevent false positives
		// This prevents "glm" alone from matching "glm-4.5-air"
		return matches >= 2;
	}

	// Find matching LLM benchmark using scoring system (find BEST match, not first match)
	const llmBenchmark = $derived.by(() => {
		if (!benchmarks.data?.available || !benchmarks.data.llms) return null;

		const modelName = stripSuffixes(model.name).toLowerCase();
		const modelIdFull = model.id.toLowerCase();
		const modelIdShort = extractModelName(model.id).toLowerCase();
		const normalizedName = normalizeForMatch(stripSuffixes(model.name));
		const normalizedId = normalizeForMatch(modelIdShort);
		const modelNameTokens = extractKeyTokens(stripSuffixes(model.name));
		const modelIdTokens = extractKeyTokens(modelIdShort);

		console.log('[AA Benchmark] Searching for model:', {
			name: model.name,
			id: model.id,
			modelIdShort,
			normalizedName,
			normalizedId,
			nameTokens: Array.from(modelNameTokens),
			idTokens: Array.from(modelIdTokens),
		});

		let bestMatch: AALLMModel | null = null;
		let bestScore = 0;
		let bestMatchReason = '';

		for (const llm of benchmarks.data.llms) {
			const aaName = llm.name.toLowerCase();
			const aaSlug = llm.slug.toLowerCase();
			const normalizedAaName = normalizeForMatch(llm.name);
			const normalizedAaSlug = normalizeForMatch(llm.slug);

			let score = 0;
			let reason = '';

			// EXACT matches get highest score (100)
			if (modelName === aaName) {
				score = 100;
				reason = 'EXACT NAME';
			} else if (modelIdShort === aaSlug || modelIdFull === aaSlug) {
				score = 100;
				reason = 'EXACT SLUG';
			}
			// NORMALIZED EXACT matches get high score (90)
			else if (normalizedName === normalizedAaName) {
				score = 90;
				reason = 'NORMALIZED EXACT NAME';
			} else if (normalizedId === normalizedAaSlug) {
				score = 90;
				reason = 'NORMALIZED EXACT SLUG';
			}
			// Token-based matching with score based on number of matching tokens
			else {
				const aaNameTokens = extractKeyTokens(llm.name);
				const aaSlugTokens = extractKeyTokens(llm.slug);

				// Count matching tokens
				let nameMatches = 0;
				for (const token of modelNameTokens) {
					if (aaNameTokens.has(token)) nameMatches++;
				}
				let slugMatches = 0;
				for (const token of modelIdTokens) {
					if (aaSlugTokens.has(token)) slugMatches++;
				}

				const maxTokenMatches = Math.max(nameMatches, slugMatches);
				const minTokensNeeded = Math.min(
					modelNameTokens.size,
					modelIdTokens.size,
					aaNameTokens.size,
					aaSlugTokens.size
				);

				// Require ALL tokens to match for a valid score (prevents partial matches)
				if (maxTokenMatches >= 2 && maxTokenMatches >= minTokensNeeded) {
					// Score based on how many tokens matched
					score = 50 + maxTokenMatches * 10;
					reason = `TOKEN MATCH (${maxTokenMatches} tokens)`;
				}
			}

			if (score > bestScore) {
				bestScore = score;
				bestMatch = llm;
				bestMatchReason = reason;
			}
		}

		if (bestMatch && bestScore >= 50) {
			console.log('[AA Benchmark] Best match:', {
				name: bestMatch.name,
				slug: bestMatch.slug,
				score: bestScore,
				reason: bestMatchReason,
				evaluations: bestMatch.evaluations,
			});
			return bestMatch;
		}

		console.log('[AA Benchmark] No match found for:', model.name);
		return null;
	});

	// Find matching image model benchmark
	const imageBenchmark = $derived.by(() => {
		if (!benchmarks.data?.available || !benchmarks.data.imageModels || !isImageOnlyModel(model))
			return null;

		const modelName = model.name.toLowerCase();
		const modelIdShort = extractModelName(model.id).toLowerCase();
		const normalizedName = normalizeForMatch(model.name);
		const normalizedId = normalizeForMatch(modelIdShort);
		const modelNameTokens = extractKeyTokens(model.name);
		const modelIdTokens = extractKeyTokens(modelIdShort);

		return benchmarks.data.imageModels.find((img: AAImageModel) => {
			const aaName = img.name.toLowerCase();
			const aaSlug = img.slug.toLowerCase();
			const normalizedAaName = normalizeForMatch(img.name);
			const normalizedAaSlug = normalizeForMatch(img.slug);

			// Exact matches
			if (modelName === aaName || modelIdShort === aaSlug) return true;

			// Normalized matches
			if (normalizedName === normalizedAaName || normalizedId === normalizedAaSlug) return true;

			// Partial matches
			if (modelName.includes(aaName) || aaName.includes(modelName)) return true;
			if (modelIdShort.includes(aaSlug) || aaSlug.includes(modelIdShort)) return true;

			// Normalized partial matches
			if (normalizedName.includes(normalizedAaName) || normalizedAaName.includes(normalizedName))
				return true;
			if (normalizedId.includes(normalizedAaSlug) || normalizedAaSlug.includes(normalizedId))
				return true;

			// Token-based matching (handles different word orderings)
			const aaNameTokens = extractKeyTokens(img.name);
			const aaSlugTokens = extractKeyTokens(img.slug);
			if (tokensMatch(modelNameTokens, aaNameTokens)) return true;
			if (tokensMatch(modelIdTokens, aaSlugTokens)) return true;
			if (tokensMatch(modelNameTokens, aaSlugTokens)) return true;
			if (tokensMatch(modelIdTokens, aaNameTokens)) return true;

			return false;
		});
	});

	const hasBenchmarks = $derived(llmBenchmark || imageBenchmark);

	function formatNumber(num: number | undefined): string {
		if (!num) return '-';
		if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
		if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
		return num.toString();
	}

	function formatDate(timestamp: number | undefined): string {
		if (!timestamp) return '-';
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}

	function formatPrice(price: string | undefined): string {
		if (!price) return '-';
		const num = parseFloat(price);
		if (isNaN(num)) return '-';
		if (num === 0) return 'Free';
		return `$${num.toFixed(2)}`;
	}

	function getProviderName(ownedBy: string | undefined): string {
		if (!ownedBy) return 'Unknown';
		// Clean up common patterns
		return ownedBy
			.replace('organization-owner', 'Third Party')
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function formatBenchmarkScore(score: number | undefined): string {
		if (score === undefined || score === null) return '-';
		return score.toFixed(1);
	}
</script>

<div class="bg-popover border-border flex h-full w-[320px] flex-col overflow-hidden border-l">
	<!-- Header -->
	<div class="border-border flex items-start gap-3 border-b p-4">
		{#if iconUrl}
			<img src={iconUrl} alt="" class="size-10 flex-shrink-0 object-contain" />
		{:else}
			<div class="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded">
				?
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<h3 class="truncate text-base font-semibold">{model.name}</h3>
			<p class="text-muted-foreground truncate text-xs">{model.id}</p>
		</div>
		<button class="hover:bg-accent flex-shrink-0 rounded p-1 transition-colors" onclick={onClose}>
			<XIcon class="size-4" />
		</button>
	</div>

	<!-- Content -->
	<div class="flex-1 space-y-4 overflow-y-auto p-4">
		<!-- Description -->
		{#if model.description}
			<div>
				<h4 class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
					Description
				</h4>
				<p class="text-sm">{model.description}</p>
			</div>
		{/if}

		<!-- Benchmarks Section -->
		{#if hasBenchmarks}
			<div>
				<h4 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
					<span class="inline-flex items-center gap-1.5">
						<TrendingUpIcon class="size-3" />
						Benchmarks
					</span>
				</h4>

				{#if llmBenchmark}
					<div class="bg-muted/50 space-y-2 rounded-lg p-3">
						{#if llmBenchmark.evaluations?.artificial_analysis_intelligence_index}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Intelligence</span>
								<span class="font-medium text-blue-400"
									>{formatBenchmarkScore(
										llmBenchmark.evaluations.artificial_analysis_intelligence_index
									)}</span
								>
							</div>
						{/if}
						{#if llmBenchmark.evaluations?.artificial_analysis_coding_index}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Coding</span>
								<span class="font-medium text-green-400"
									>{formatBenchmarkScore(
										llmBenchmark.evaluations.artificial_analysis_coding_index
									)}</span
								>
							</div>
						{/if}
						{#if llmBenchmark.evaluations?.artificial_analysis_math_index}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Math</span>
								<span class="font-medium text-purple-400"
									>{formatBenchmarkScore(
										llmBenchmark.evaluations.artificial_analysis_math_index
									)}</span
								>
							</div>
						{/if}
						{#if llmBenchmark.median_output_tokens_per_second}
							<div class="border-border flex justify-between border-t pt-2 text-sm">
								<span class="text-muted-foreground inline-flex items-center gap-1">
									<ZapIcon class="size-3" />
									Speed
								</span>
								<span class="font-medium text-yellow-400"
									>{llmBenchmark.median_output_tokens_per_second.toFixed(0)} tok/s</span
								>
							</div>
						{/if}
					</div>
				{/if}

				{#if imageBenchmark}
					<div class="bg-muted/50 space-y-2 rounded-lg p-3">
						{#if imageBenchmark.elo}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">ELO Rating</span>
								<span class="font-medium text-blue-400">{imageBenchmark.elo}</span>
							</div>
						{/if}
						{#if imageBenchmark.rank}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Rank</span>
								<span class="font-medium text-amber-400">#{imageBenchmark.rank}</span>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Attribution -->
				<a
					href="https://artificialanalysis.ai"
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs transition-colors"
				>
					Data from Artificial Analysis
					<ExternalLinkIcon class="size-3" />
				</a>
			</div>
		{/if}

		<!-- Features -->
		<div>
			<h4 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
				Features
			</h4>
			<div class="flex flex-wrap gap-2">
				{#if supportsVision(model)}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 px-2.5 py-1 text-xs text-purple-400"
					>
						<EyeIcon class="size-3" />
						Vision
					</span>
				{/if}
				{#if supportsReasoning(model)}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-1 text-xs text-green-400"
					>
						<BrainIcon class="size-3" />
						Reasoning
					</span>
				{/if}
				{#if isImageOnlyModel(model)}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-1 text-xs text-blue-400"
					>
						<ImageIcon class="size-3" />
						Image Gen
					</span>
				{/if}
				{#if supportsVideo(model)}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-2.5 py-1 text-xs text-cyan-400"
					>
						<VideoIcon class="size-3" />
						Video Gen
					</span>
				{/if}
				{#if !supportsVision(model) && !supportsReasoning(model) && !isImageOnlyModel(model) && !supportsVideo(model)}
					<span class="text-muted-foreground text-xs">No special features</span>
				{/if}
			</div>
		</div>

		<!-- Provider & Context -->
		<div class="grid grid-cols-2 gap-4">
			<div>
				<h4 class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
					Provider
				</h4>
				<p class="text-sm">{getProviderName(model.owned_by)}</p>
			</div>
			<div>
				<h4 class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
					Context
				</h4>
				<p class="text-sm">{formatNumber(model.context_length)} tokens</p>
			</div>
		</div>

		<!-- Max Output & Added -->
		<div class="grid grid-cols-2 gap-4">
			<div>
				<h4 class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
					Max Output
				</h4>
				<p class="text-sm">{formatNumber(model.max_output_tokens)} tokens</p>
			</div>
			<div>
				<h4 class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
					Added
				</h4>
				<p class="text-sm">{formatDate(model.created)}</p>
			</div>
		</div>

		<!-- Pricing -->
		{#if model.pricing}
			<div>
				<h4 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
					Pricing
				</h4>
				<div class="bg-muted/50 space-y-2 rounded-lg p-3">
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Input</span>
						<span>{formatPrice(model.pricing.prompt)} / 1M tokens</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Output</span>
						<span>{formatPrice(model.pricing.completion)} / 1M tokens</span>
					</div>
					{#if model.cost_estimate}
						<div class="border-border flex justify-between border-t pt-2 text-sm">
							<span class="text-muted-foreground">Est. per message</span>
							<span class="text-green-400">${model.cost_estimate.toFixed(4)}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Subscription -->
		{#if model.subscription}
			<div>
				<h4 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
					Subscription
				</h4>
				<div
					class={cn(
						'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
						model.subscription.included
							? 'bg-green-500/10 text-green-400'
							: 'bg-yellow-500/10 text-yellow-400'
					)}
				>
					{#if model.subscription.included}
						<CheckIcon class="size-4" />
					{:else}
						<XIcon class="size-4" />
					{/if}
					<span
						>{model.subscription.note ||
							(model.subscription.included ? 'Included in subscription' : 'Not included')}</span
					>
				</div>
			</div>
		{/if}
	</div>
</div>
