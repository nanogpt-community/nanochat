<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils/utils';
	import type { PageData } from './$types';
	import StarIcon from '~icons/lucide/star';
	import TrendingUpIcon from '~icons/lucide/trending-up';
	import DollarSignIcon from '~icons/lucide/dollar-sign';
	import MessageSquareIcon from '~icons/lucide/message-square';
	import ThumbsUpIcon from '~icons/lucide/thumbs-up';
	import ThumbsDownIcon from '~icons/lucide/thumbs-down';
	import RefreshCwIcon from '~icons/lucide/refresh-cw';
	import CheckCircleIcon from '~icons/lucide/check-circle';
	import SparklesIcon from '~icons/lucide/sparkles';
	import ZapIcon from '~icons/lucide/zap';
	import ArrowUpIcon from '~icons/lucide/arrow-up';
	import ArrowDownIcon from '~icons/lucide/arrow-down';
	import ArrowUpDownIcon from '~icons/lucide/arrow-up-down';

	let { data }: { data: PageData } = $props();

	let sortColumn = $state<'model' | 'rating' | 'uses' | 'cost' | 'thumbsRatio' | 'speed'>('uses');
	let sortDirection = $state<'asc' | 'desc'>('desc');
	let isRefreshing = $state(false);

	const sortedStats = $derived.by(() => {
		const stats = [...data.stats].filter((s) => s.totalMessages > 0);
		stats.sort((a, b) => {
			let aVal: number;
			let bVal: number;

			switch (sortColumn) {
				case 'model':
					return sortDirection === 'asc'
						? a.modelId.localeCompare(b.modelId)
						: b.modelId.localeCompare(a.modelId);
				case 'rating':
					aVal = a.avgRating ?? 0;
					bVal = b.avgRating ?? 0;
					break;
				case 'uses':
					aVal = a.totalMessages;
					bVal = b.totalMessages;
					break;
				case 'cost':
					aVal = a.totalMessages > 0 && !isNaN(a.totalCost) ? a.totalCost / a.totalMessages : 0;
					bVal = b.totalMessages > 0 && !isNaN(b.totalCost) ? b.totalCost / b.totalMessages : 0;
					break;
				case 'thumbsRatio':
					const aTotal = a.thumbsUpCount + a.thumbsDownCount;
					const bTotal = b.thumbsUpCount + b.thumbsDownCount;
					aVal = aTotal > 0 ? a.thumbsUpCount / aTotal : 0;
					bVal = bTotal > 0 ? b.thumbsUpCount / bTotal : 0;
					break;
				case 'speed':
					aVal = getTokensPerSecond(a);
					bVal = getTokensPerSecond(b);
					break;
				default:
					aVal = 0;
					bVal = 0;
			}

			return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
		});
		return stats;
	});

	function toggleSort(column: typeof sortColumn) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'desc';
		}
	}

	async function refreshStats() {
		isRefreshing = true;
		try {
			await fetch('/api/db/model-performance?recalculate=true');
			window.location.reload();
		} catch (error) {
			console.error('Failed to refresh stats:', error);
		} finally {
			isRefreshing = false;
		}
	}

	function formatCost(cost: number): string {
		if (isNaN(cost)) return 'N/A';
		return `$${cost.toFixed(6)}`;
	}

	function formatCostSafe(cost: number | null | undefined): string {
		if (cost === null || cost === undefined || isNaN(cost)) return 'N/A';
		return `$${cost.toFixed(2)}`;
	}

	function getThumbsRatio(upCount: number, downCount: number): string {
		const total = upCount + downCount;
		if (total === 0) return 'N/A';
		const ratio = (upCount / total) * 100;
		return `${ratio.toFixed(0)}%`;
	}

	function getTokensPerSecond(stat: (typeof sortedStats)[0]): number {
		if (!stat.avgTokens || !stat.avgResponseTime || stat.avgResponseTime <= 0) return 0;
		return stat.avgTokens / (stat.avgResponseTime / 1000);
	}

	function getTopCategories(stat: (typeof sortedStats)[0]): Array<{ name: string; count: number }> {
		const categories = [
			{ name: 'Accurate', count: stat.accurateCount },
			{ name: 'Helpful', count: stat.helpfulCount },
			{ name: 'Creative', count: stat.creativeCount },
			{ name: 'Fast', count: stat.fastCount },
			{ name: 'Cost-effective', count: stat.costEffectiveCount },
		];
		return categories
			.filter((c) => c.count > 0)
			.sort((a, b) => b.count - a.count)
			.slice(0, 3);
	}

	function getCategoryIcon(name: string) {
		switch (name) {
			case 'Accurate':
				return CheckCircleIcon;
			case 'Helpful':
				return ThumbsUpIcon;
			case 'Creative':
				return SparklesIcon;
			case 'Fast':
				return ZapIcon;
			case 'Cost-effective':
				return DollarSignIcon;
			default:
				return StarIcon;
		}
	}
</script>

<svelte:head>
	<title>Analytics | nanochat</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-bold tracking-tight">Analytics</h1>
	<p class="text-muted-foreground text-sm">
		Track and compare the performance of AI models you've used.
	</p>
</div>

<div class="mt-6 flex flex-col gap-6">
	{#if data.stats.length > 0}
		<!-- Overview stats -->
		<section class="flex flex-col gap-3">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div class="flex flex-col gap-0.5">
					<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
						Overview
					</h2>
					<p class="text-muted-foreground text-xs">Totals across all your conversations.</p>
				</div>
				<Button onclick={refreshStats} disabled={isRefreshing} size="sm" variant="outline">
					<RefreshCwIcon class={cn('mr-2 size-4', { 'animate-spin': isRefreshing })} />
					{isRefreshing ? 'Refreshing...' : 'Refresh Stats'}
				</Button>
			</div>

			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="bg-card border-border rounded-lg border p-4">
					<div
						class="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase"
					>
						<MessageSquareIcon class="size-3.5" /> Total Messages
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums">
						{data.insights.totalMessages.toLocaleString()}
					</div>
				</div>

				<div class="bg-card border-border rounded-lg border p-4">
					<div
						class="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase"
					>
						<DollarSignIcon class="size-3.5" /> Total Cost
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums">
						{formatCostSafe(data.insights.totalCost)}
					</div>
				</div>

				<div class="bg-card border-border rounded-lg border p-4">
					<div
						class="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase"
					>
						<StarIcon class="size-3.5" /> Avg Rating
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums">
						{data.insights.avgRating ? data.insights.avgRating.toFixed(2) : 'N/A'}
					</div>
				</div>

				<div class="bg-card border-border rounded-lg border p-4">
					<div
						class="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase"
					>
						<TrendingUpIcon class="size-3.5" /> Most Used
					</div>
					<div
						class="mt-2 truncate text-2xl font-semibold"
						title={data.insights.mostUsedModel?.modelId}
					>
						{data.insights.mostUsedModel?.modelId ?? 'N/A'}
					</div>
				</div>
			</div>
		</section>

		<!-- Highlights -->
		{#if data.insights.bestRatedModel || (data.insights.mostCostEffective && !isNaN(data.insights.mostCostEffective.totalCost)) || data.insights.fastestModel}
			<section class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
						Highlights
					</h2>
					<p class="text-muted-foreground text-xs">Standout models from your usage.</p>
				</div>
				<div class="bg-card border-border divide-border divide-y rounded-lg border">
					{#if data.insights.bestRatedModel}
						<div class="flex items-start gap-3 p-5">
							<div class="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-md p-2">
								<StarIcon class="size-4" />
							</div>
							<div class="flex min-w-0 flex-col gap-1">
								<span class="font-medium">Best Rated Model</span>
								<span class="text-muted-foreground text-sm">
									<strong class="text-foreground">{data.insights.bestRatedModel.modelId}</strong>
									with an average rating of
									<strong class="text-foreground"
										>{data.insights.bestRatedModel.avgRating?.toFixed(2)}</strong
									>
									({data.insights.bestRatedModel.totalMessages} messages)
								</span>
							</div>
						</div>
					{/if}

					{#if data.insights.mostCostEffective && !isNaN(data.insights.mostCostEffective.totalCost)}
						<div class="flex items-start gap-3 p-5">
							<div class="bg-green-500/10 text-green-600 dark:text-green-400 rounded-md p-2">
								<DollarSignIcon class="size-4" />
							</div>
							<div class="flex min-w-0 flex-col gap-1">
								<span class="font-medium">Most Cost-Effective</span>
								<span class="text-muted-foreground text-sm">
									<strong class="text-foreground"
										>{data.insights.mostCostEffective.modelId}</strong
									>
									at
									<strong class="text-foreground"
										>{formatCost(
											data.insights.mostCostEffective.totalCost /
												data.insights.mostCostEffective.totalMessages
										)}</strong
									>
									per message
								</span>
							</div>
						</div>
					{/if}

					{#if data.insights.fastestModel}
						<div class="flex items-start gap-3 p-5">
							<div class="bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md p-2">
								<ZapIcon class="size-4" />
							</div>
							<div class="flex min-w-0 flex-col gap-1">
								<span class="font-medium">Fastest Model</span>
								<span class="text-muted-foreground text-sm">
									<strong class="text-foreground">{data.insights.fastestModel.modelId}</strong>
									with an average speed of
									<strong class="text-foreground"
										>{getTokensPerSecond(data.insights.fastestModel).toFixed(1)} tokens/sec</strong
									>
									({data.insights.fastestModel.totalMessages} messages)
								</span>
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}

		<!-- Model comparison -->
		<section class="flex flex-col gap-3">
			<div class="flex flex-col gap-0.5">
				<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
					Model Comparison
				</h2>
				<p class="text-muted-foreground text-xs">
					Sort by any column to compare usage, cost, ratings, and speed.
				</p>
			</div>
			<div class="bg-card border-border overflow-x-auto rounded-lg border">
				<table class="w-full">
					<thead>
						<tr class="border-border border-b">
							<th class="px-5 pt-4 pb-3 text-left">
								<button
									type="button"
									onclick={() => toggleSort('model')}
									class="hover:text-foreground text-muted-foreground flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
								>
									Model
									{#if sortColumn === 'model'}
										{#if sortDirection === 'asc'}
											<ArrowUpIcon class="size-3" />
										{:else}
											<ArrowDownIcon class="size-3" />
										{/if}
									{/if}
								</button>
							</th>
							<th class="px-3 pt-4 pb-3 text-center">
								<button
									type="button"
									onclick={() => toggleSort('rating')}
									class="hover:text-foreground text-muted-foreground mx-auto flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
								>
									Rating
									{#if sortColumn === 'rating'}
										{#if sortDirection === 'asc'}
											<ArrowUpIcon class="size-3" />
										{:else}
											<ArrowDownIcon class="size-3" />
										{/if}
									{/if}
								</button>
							</th>
							<th class="px-3 pt-4 pb-3 text-center">
								<button
									type="button"
									onclick={() => toggleSort('uses')}
									class="hover:text-foreground text-muted-foreground mx-auto flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
								>
									Uses
									{#if sortColumn === 'uses'}
										{#if sortDirection === 'asc'}
											<ArrowUpIcon class="size-3" />
										{:else}
											<ArrowDownIcon class="size-3" />
										{/if}
									{/if}
								</button>
							</th>
							<th class="px-3 pt-4 pb-3 text-center">
								<button
									type="button"
									onclick={() => toggleSort('cost')}
									class="hover:text-foreground text-muted-foreground mx-auto flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
								>
									Avg Cost
									{#if sortColumn === 'cost'}
										{#if sortDirection === 'asc'}
											<ArrowUpIcon class="size-3" />
										{:else}
											<ArrowDownIcon class="size-3" />
										{/if}
									{/if}
								</button>
							</th>
							<th class="px-3 pt-4 pb-3 text-center">
								<button
									type="button"
									onclick={() => toggleSort('thumbsRatio')}
									class="hover:text-foreground text-muted-foreground mx-auto flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
								>
									Thumbs Up
									{#if sortColumn === 'thumbsRatio'}
										{#if sortDirection === 'asc'}
											<ArrowUpIcon class="size-3" />
										{:else}
											<ArrowDownIcon class="size-3" />
										{/if}
									{/if}
								</button>
							</th>
							<th class="px-3 pt-4 pb-3 text-center">
								<button
									type="button"
									onclick={() => toggleSort('speed')}
									class="hover:text-foreground text-muted-foreground mx-auto flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
								>
									Speed (t/s)
									{#if sortColumn === 'speed'}
										{#if sortDirection === 'asc'}
											<ArrowUpIcon class="size-3" />
										{:else}
											<ArrowDownIcon class="size-3" />
										{/if}
									{/if}
								</button>
							</th>
							<th class="px-3 pt-4 pb-3 text-center">
								<span
									class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
									>Top Categories</span
								>
							</th>
							<th class="px-5 pt-4 pb-3 text-center">
								<span
									class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
									>Errors</span
								>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedStats as stat}
							<tr class="border-border border-b last:border-b-0">
								<td class="px-5 py-3">
									<div>
										<div class="font-medium" title={stat.modelId}>{stat.modelId}</div>
										<div class="text-muted-foreground text-xs">{stat.provider}</div>
									</div>
								</td>
								<td class="px-3 py-3 text-center">
									<div class="flex items-center justify-center gap-1">
										{#if stat.avgRating !== null}
											<StarIcon class="size-4 fill-yellow-500 text-yellow-500" />
											<span class="tabular-nums">{stat.avgRating.toFixed(2)}</span>
										{:else}
											<span class="text-muted-foreground">N/A</span>
										{/if}
									</div>
								</td>
								<td class="px-3 py-3 text-center tabular-nums">{stat.totalMessages}</td>
								<td class="px-3 py-3 text-center tabular-nums">
									{#if !isNaN(stat.totalCost) && stat.totalMessages > 0}
										{formatCost(stat.totalCost / stat.totalMessages)}
									{:else}
										<span class="text-muted-foreground text-sm">N/A</span>
									{/if}
								</td>
								<td class="px-3 py-3">
									<div class="flex items-center justify-center gap-2">
										<div class="flex items-center gap-1">
											<ThumbsUpIcon class="size-4 text-green-500" />
											<span class="text-sm tabular-nums">{stat.thumbsUpCount}</span>
										</div>
										<div class="flex items-center gap-1">
											<ThumbsDownIcon class="size-4 text-red-500" />
											<span class="text-sm tabular-nums">{stat.thumbsDownCount}</span>
										</div>
										<span class="text-muted-foreground text-sm">
											({getThumbsRatio(stat.thumbsUpCount, stat.thumbsDownCount)})
										</span>
									</div>
								</td>
								<td class="px-3 py-3 text-center tabular-nums">
									{#if stat.avgTokens !== null && stat.avgTokens !== undefined && stat.avgResponseTime && stat.avgResponseTime > 0}
										{@const tps = getTokensPerSecond(stat)}
										<span>{tps.toFixed(1)}</span>
									{:else}
										<span class="text-muted-foreground text-sm">N/A</span>
									{/if}
								</td>
								<td class="px-3 py-3">
									{#if getTopCategories(stat).length > 0}
										{@const topCategories = getTopCategories(stat)}
										<div class="flex flex-wrap items-center justify-center gap-1">
											{#each topCategories as category}
												{@const Icon = getCategoryIcon(category.name)}
												<span
													class="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
													title={`${category.name}: ${category.count}`}
												>
													<Icon class="size-3" />
													{category.name}
													<span class="text-muted-foreground">{category.count}</span>
												</span>
											{/each}
										</div>
									{:else}
										<span class="text-muted-foreground text-sm">—</span>
									{/if}
								</td>
								<td class="px-5 py-3 text-center">
									<span
										class={cn('text-sm tabular-nums', {
											'text-destructive': stat.errorCount > 0,
											'text-muted-foreground': stat.errorCount === 0,
										})}
									>
										{stat.errorCount}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{:else}
		<div
			class="bg-card border-border flex flex-col items-center justify-center gap-3 rounded-lg border p-12"
		>
			<MessageSquareIcon class="text-muted-foreground size-12 opacity-50" />
			<div class="flex flex-col items-center gap-1">
				<h2 class="text-lg font-semibold">No Data Yet</h2>
				<p class="text-muted-foreground text-center text-sm">
					Start chatting with AI models to see performance analytics here.
				</p>
			</div>
		</div>
	{/if}
</div>
