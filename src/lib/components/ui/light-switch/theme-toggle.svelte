<script lang="ts">
	import { api, useCachedQuery } from '$lib/cache/cached-query.svelte.js';
	import type { UserSettings } from '$lib/api';
	import { session } from '$lib/state/session.svelte.js';
	import LightSwitch from './light-switch.svelte';
	import type { LightSwitchProps } from './types';

	type ThemeToggleSettings = {
		theme: string | null | undefined;
		isLoading?: boolean;
		error?: Error | undefined;
	};

	type ThemeToggleProps = LightSwitchProps & {
		settings?: ThemeToggleSettings;
		label?: string;
		wrapperClass?: string;
		labelClass?: string;
	};

	let {
		variant = 'outline',
		class: className,
		settings: providedSettings,
		label,
		wrapperClass,
		labelClass,
	}: ThemeToggleProps = $props();

	const shouldFetchSettings = $derived(!providedSettings && !!session.current?.user.id);
	const userSettings = useCachedQuery<UserSettings>(
		api.user_settings.get,
		{},
		{ enabled: shouldFetchSettings }
	);

	const resolvedTheme = $derived(providedSettings?.theme ?? userSettings.data?.theme);
	const isLoading = $derived(providedSettings?.isLoading ?? userSettings.isLoading);
	const hasError = $derived(!!(providedSettings?.error ?? userSettings.error));
	const showThemeToggle = $derived(
		!session.current?.user.id && !providedSettings
			? true
			: !isLoading && (resolvedTheme == null || hasError)
	);
</script>

{#if showThemeToggle}
	{#if label}
		<div class={wrapperClass}>
			<span class={labelClass}>{label}</span>
			<LightSwitch {variant} class={className} />
		</div>
	{:else}
		<LightSwitch {variant} class={className} />
	{/if}
{/if}
