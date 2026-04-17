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

	const currentThemeData = $derived(currentTheme ? (getTheme(currentTheme) ?? null) : null);
	const primarySwatch = $derived(
		primaryColor && hexColorRegex.test(primaryColor)
			? primaryColor.toLowerCase()
			: (currentThemeData?.colors.primary ?? getComputedThemeColor('--primary') ?? '#0f172a')
	);
	const accentSwatch = $derived(
		accentColor && hexColorRegex.test(accentColor)
			? accentColor.toLowerCase()
			: (currentThemeData?.colors.accent ?? getComputedThemeColor('--accent') ?? '#0f172a')
	);

	function normalizeHex(color: string | null | undefined): string | null {
		if (typeof color !== 'string') return null;
		const trimmed = color.trim().toLowerCase();
		return /^#([0-9a-f]{6})$/.test(trimmed) ? trimmed : null;
	}

	function getComputedThemeColor(variable: '--primary' | '--accent'): string | null {
		if (typeof document === 'undefined') return null;
		const style = getComputedStyle(document.documentElement)
			.getPropertyValue(variable)
			.trim()
			.toLowerCase();
		return /^#([0-9a-f]{6})$/.test(style) ? style : null;
	}

	async function saveTheme(
		themeId: string | null,
		nextPrimaryColor: string | null,
		nextAccentColor: string | null
	) {
		if (!session.current?.user.id) return;

		const theme = themeId ? (getTheme(themeId) ?? null) : null;
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
			const previousThemeData = previousTheme ? (getTheme(previousTheme) ?? null) : null;
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
		await saveTheme(currentTheme ?? null, nextColor, normalizeHex(accentColor));
	}

	async function handleAccentColorChange(event: Event) {
		const nextColor = normalizeHex((event.currentTarget as HTMLInputElement).value);
		if (!nextColor) return;
		await saveTheme(currentTheme ?? null, normalizeHex(primaryColor), nextColor);
	}

	function resetPrimaryColor() {
		if (!saving) {
			void saveTheme(currentTheme ?? null, null, normalizeHex(accentColor));
		}
	}

	function resetAccentColor() {
		if (!saving) {
			void saveTheme(currentTheme ?? null, normalizeHex(primaryColor), null);
		}
	}
</script>

<div class="flex flex-col gap-5">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
		<!-- Auto (System Default) Option -->
		<button
			type="button"
			onclick={() => selectTheme(null)}
			disabled={saving}
			class="group relative overflow-hidden rounded-lg border text-left transition-all disabled:opacity-50 {currentTheme ===
			null
				? 'border-primary ring-primary/20 ring-2'
				: 'border-border hover:border-primary/50'}"
		>
			<!-- Preview: half-light / half-dark split -->
			<div class="relative h-20 w-full overflow-hidden">
				<div class="absolute inset-0 flex">
					<div class="flex w-1/2 items-center justify-center bg-white">
						<div class="flex flex-col gap-1">
							<div class="h-1.5 w-10 rounded-full bg-slate-300"></div>
							<div class="h-1.5 w-7 rounded-full bg-slate-200"></div>
						</div>
					</div>
					<div class="flex w-1/2 items-center justify-center bg-slate-900">
						<div class="flex flex-col gap-1">
							<div class="h-1.5 w-10 rounded-full bg-slate-600"></div>
							<div class="h-1.5 w-7 rounded-full bg-slate-700"></div>
						</div>
					</div>
				</div>
			</div>
			<div class="flex items-center justify-between gap-2 border-t border-inherit p-3">
				<div class="flex min-w-0 flex-col">
					<span class="truncate text-sm font-medium">Auto</span>
					<span class="text-muted-foreground text-xs">Follow system</span>
				</div>
				{#if currentTheme === null}
					<div
						class="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full"
					>
						<CheckIcon class="size-3" />
					</div>
				{/if}
			</div>
		</button>

		<!-- Theme Options -->
		{#each themes as theme (theme.id)}
			<button
				type="button"
				onclick={() => selectTheme(theme.id)}
				disabled={saving}
				class="group relative overflow-hidden rounded-lg border text-left transition-all disabled:opacity-50 {currentTheme ===
				theme.id
					? 'border-primary ring-primary/20 ring-2'
					: 'border-border hover:border-primary/50'}"
			>
				<!-- Preview: mini UI mockup using theme colors -->
				<div
					class="relative h-20 w-full overflow-hidden"
					style="background-color: {theme.colors.background};"
				>
					<!-- Sidebar strip -->
					<div
						class="absolute top-0 bottom-0 left-0 w-1/4 border-r"
						style="background-color: {theme.colors.sidebar}; border-color: {theme.colors.border};"
					></div>
					<!-- Content area with accent + primary "pills" -->
					<div class="absolute top-3 right-3 flex flex-col gap-1.5">
						<div
							class="h-2 w-16 rounded-full"
							style="background-color: {theme.colors.primary};"
						></div>
						<div
							class="h-2 w-12 rounded-full opacity-80"
							style="background-color: {theme.colors.accent};"
						></div>
						<div class="h-1.5 w-10 rounded-full opacity-40" style="background-color: {theme.colors.border};"></div>
					</div>
				</div>
				<div class="flex items-center justify-between gap-2 border-t border-inherit p-3">
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm font-medium">{theme.name}</span>
						<span class="text-muted-foreground text-xs capitalize">{theme.mode}</span>
					</div>
					{#if currentTheme === theme.id}
						<div
							class="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full"
						>
							<CheckIcon class="size-3" />
						</div>
					{/if}
				</div>
			</button>
		{/each}
	</div>

	{#if currentThemeData || currentTheme === null}
		<div class="border-border bg-muted/30 flex flex-col gap-3 rounded-lg border p-4">
			<div class="flex flex-col gap-0.5">
				<p class="text-sm font-medium">Custom Accents</p>
				<p class="text-muted-foreground text-xs">Override this theme's primary and accent colors.</p>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<label for="theme-primary-color" class="text-muted-foreground text-xs font-medium">
						Primary
					</label>
					<div class="flex items-center gap-2">
						<label
							for="theme-primary-color"
							class="border-border relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border"
							style="background-color: {primarySwatch};"
						>
							<input
								id="theme-primary-color"
								type="color"
								value={primarySwatch}
								onchange={handlePrimaryColorChange}
								disabled={saving}
								class="absolute inset-0 size-full cursor-pointer opacity-0"
								aria-label="Primary color"
							/>
						</label>
						<span class="font-mono text-xs uppercase tabular-nums">{primarySwatch}</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="ml-auto"
							disabled={saving}
							onclick={resetPrimaryColor}
						>
							Reset
						</Button>
					</div>
				</div>
				<div class="flex flex-col gap-2">
					<label for="theme-accent-color" class="text-muted-foreground text-xs font-medium">
						Accent
					</label>
					<div class="flex items-center gap-2">
						<label
							for="theme-accent-color"
							class="border-border relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border"
							style="background-color: {accentSwatch};"
						>
							<input
								id="theme-accent-color"
								type="color"
								value={accentSwatch}
								onchange={handleAccentColorChange}
								disabled={saving}
								class="absolute inset-0 size-full cursor-pointer opacity-0"
								aria-label="Accent color"
							/>
						</label>
						<span class="font-mono text-xs uppercase tabular-nums">{accentSwatch}</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="ml-auto"
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
			Switch to a concrete theme to customize primary and accent colors.
		</p>
	{/if}
</div>
