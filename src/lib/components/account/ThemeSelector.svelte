<script lang="ts">
	import { themes, getTheme, applyTheme, type Theme } from '$lib/themes/themes';
	import { mutate } from '$lib/client/mutation.svelte';
	import { api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { ResultAsync } from 'neverthrow';
	import CheckIcon from '~icons/lucide/check';

	let { currentTheme = $bindable() }: { currentTheme: string | null | undefined } = $props();

	let saving = $state(false);

	async function selectTheme(themeId: string | null) {
		if (!session.current?.user.id) return;

		saving = true;
		const theme = themeId ? getTheme(themeId) : null;

		// Apply theme immediately for instant feedback
		applyTheme(theme || null);

		// Save to database
		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					theme: themeId,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isOk()) {
			currentTheme = themeId;
		} else {
			console.error('Failed to save theme:', res.error);
			// Revert theme on error
			const revertTheme = currentTheme ? getTheme(currentTheme) : null;
			applyTheme(revertTheme || null);
		}

		saving = false;
	}
</script>

<div class="flex flex-col gap-4">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<!-- Auto (System Default) Option -->
		<button
			type="button"
			onclick={() => selectTheme(null)}
			disabled={saving}
			class="border-input hover:bg-accent relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors disabled:opacity-50 {currentTheme ===
			null
				? 'ring-ring ring-2'
				: ''}"
		>
			<div class="flex items-center justify-between">
				<span class="font-medium">Auto</span>
				{#if currentTheme === null}
					<CheckIcon class="text-primary h-5 w-5" />
				{/if}
			</div>
			<p class="text-muted-foreground text-sm">System default light/dark theme</p>
			<div class="mt-2 flex gap-2">
				<div class="h-8 w-12 rounded border border-gray-300 bg-white"></div>
				<div class="h-8 w-12 rounded border border-gray-700 bg-gray-900"></div>
			</div>
		</button>

		<!-- Theme Options -->
		{#each themes as theme (theme.id)}
			<button
				type="button"
				onclick={() => selectTheme(theme.id)}
				disabled={saving}
				class="border-input hover:bg-accent relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors disabled:opacity-50 {currentTheme ===
				theme.id
					? 'ring-ring ring-2'
					: ''}"
			>
				<div class="flex items-center justify-between">
					<span class="font-medium">{theme.name}</span>
					{#if currentTheme === theme.id}
						<CheckIcon class="text-primary h-5 w-5" />
					{/if}
				</div>
				<p class="text-muted-foreground text-xs capitalize">{theme.mode} theme</p>
				<div class="mt-2 flex gap-1">
					<div
						class="h-8 w-8 rounded border"
						style="background-color: {theme.colors.background}; border-color: {theme.colors.border};"
					></div>
					<div
						class="h-8 w-8 rounded border"
						style="background-color: {theme.colors.primary}; border-color: {theme.colors.border};"
					></div>
					<div
						class="h-8 w-8 rounded border"
						style="background-color: {theme.colors.accent}; border-color: {theme.colors.border};"
					></div>
					<div
						class="h-8 w-8 rounded border"
						style="background-color: {theme.colors.sidebar}; border-color: {theme.colors.border};"
					></div>
				</div>
			</button>
		{/each}
	</div>
</div>
