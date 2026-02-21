<script lang="ts">
	import { themes, getTheme, applyTheme } from '$lib/themes/themes';
	import { mutate } from '$lib/client/mutation.svelte';
	import { api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { ResultAsync } from 'neverthrow';
	import Button from '$lib/components/ui/button/button.svelte';
	import CheckIcon from '~icons/lucide/check';

	let {
		currentTheme = $bindable(),
		primaryColor = $bindable(),
		accentColor = $bindable(),
	}: {
	currentTheme: string | null | undefined;
		primaryColor: string | null | undefined;
		accentColor: string | null | undefined;
	} = $props();

	let saving = $state(false);
	const hexColorRegex = /^#([0-9a-f]{6})$/i;

	const currentThemeData = $derived(currentTheme ? getTheme(currentTheme) : null);
	const primarySwatch = $derived(
		primaryColor && hexColorRegex.test(primaryColor)
			? primaryColor.toLowerCase()
			: currentThemeData?.colors.primary ?? '#0f172a'
	);
	const accentSwatch = $derived(
		accentColor && hexColorRegex.test(accentColor)
			? accentColor.toLowerCase()
			: currentThemeData?.colors.accent ?? '#0f172a'
	);

	function normalizeHex(color: string | null | undefined): string | null {
		if (typeof color !== 'string') return null;
		const trimmed = color.trim().toLowerCase();
		return /^#([0-9a-f]{6})$/.test(trimmed) ? trimmed : null;
	}

	async function saveTheme(themeId: string | null, nextPrimaryColor: string | null, nextAccentColor: string | null) {
		if (!session.current?.user.id) return;

		const theme = themeId ? getTheme(themeId) : null;
		const previousTheme = currentTheme;
		const previousPrimaryColor = normalizeHex(primaryColor);
		const previousAccentColor = normalizeHex(accentColor);
		currentTheme = themeId;
		primaryColor = nextPrimaryColor;
		accentColor = nextAccentColor;
		applyTheme(theme, {
			primaryColor: nextPrimaryColor,
			accentColor: nextAccentColor,
		});

		saving = true;

		const res = await ResultAsync.fromPromise(
			mutate(
				api.user_settings.set.url,
				{
					action: 'update',
					theme: themeId as string | null,
					themePrimaryColor: nextPrimaryColor,
					themeAccentColor: nextAccentColor,
				},
				{
					invalidatePatterns: [api.user_settings.get.url],
				}
			),
			(e) => e
		);

		if (res.isErr()) {
			console.error('Failed to save theme:', res.error);
			currentTheme = previousTheme;
			primaryColor = previousPrimaryColor;
			accentColor = previousAccentColor;
			const previousThemeData = previousTheme ? getTheme(previousTheme) : null;
			applyTheme(previousThemeData, {
				primaryColor: previousPrimaryColor,
				accentColor: previousAccentColor,
			});
		}
		saving = false;
	}

	async function selectTheme(themeId: string | null) {
		await saveTheme(themeId, normalizeHex(primaryColor), normalizeHex(accentColor));
	}

	async function handlePrimaryColorChange(event: Event) {
		const nextColor = normalizeHex((event.currentTarget as HTMLInputElement).value);
		if (!nextColor) return;
		await saveTheme(currentTheme, nextColor, normalizeHex(accentColor));
	}

	async function handleAccentColorChange(event: Event) {
		const nextColor = normalizeHex((event.currentTarget as HTMLInputElement).value);
		if (!nextColor) return;
		await saveTheme(currentTheme, normalizeHex(primaryColor), nextColor);
	}

	function resetPrimaryColor() {
		if (!saving) {
			void saveTheme(currentTheme, null, normalizeHex(accentColor));
		}
	}

	function resetAccentColor() {
		if (!saving) {
			void saveTheme(currentTheme, normalizeHex(primaryColor), null);
		}
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

	{#if currentThemeData || currentTheme === null}
		<div class="space-y-3 rounded-lg border border-border p-3">
			<p class="text-muted-foreground text-sm">Customize this theme&apos;s key accents.</p>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<label class="text-sm font-medium">Primary</label>
					<div class="flex items-center gap-2">
						<input
							type="color"
							value={primarySwatch}
							onchange={handlePrimaryColorChange}
							disabled={saving}
							class="border-border h-9 w-16 cursor-pointer rounded border p-0.5"
							aria-label="Primary color"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={saving}
							onclick={resetPrimaryColor}
						>
							Reset
						</Button>
					</div>
				</div>
				<div class="flex flex-col gap-2">
					<label class="text-sm font-medium">Accent</label>
					<div class="flex items-center gap-2">
						<input
							type="color"
							value={accentSwatch}
							onchange={handleAccentColorChange}
							disabled={saving}
							class="border-border h-9 w-16 cursor-pointer rounded border p-0.5"
							aria-label="Accent color"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={saving}
							onclick={resetAccentColor}
						>
							Reset
						</Button>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<p class="text-muted-foreground text-sm">
			Switch to a concrete theme to customize primary and accent colours.
		</p>
	{/if}
</div>
