<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import {
		keybinds,
		KEYBIND_ACTIONS,
		KEYBIND_LABELS,
		DEFAULT_KEYBINDS,
		resetKeybind,
		resetAllKeybinds,
		updateKeybind,
		type KeybindAction,
		type KeybindConfig,
	} from '$lib/state/keybinds.svelte';
	import { formatKeybind, isMac } from '$lib/hooks/is-mac.svelte';
	import type { Key } from '$lib/actions/shortcut.svelte';
	import { cn } from '$lib/utils/utils';
	import RotateCcwIcon from '~icons/lucide/rotate-ccw';

	let recording = $state<KeybindAction | null>(null);

	function startRecording(action: KeybindAction) {
		recording = action;
	}

	function stopRecording() {
		recording = null;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!recording) return;

		event.preventDefault();
		event.stopPropagation();

		// Ignore modifier-only keypresses
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
			return;
		}

		const config: KeybindConfig = {
			key: event.key.toLowerCase() as Key,
			ctrl: event.ctrlKey || event.metaKey,
			shift: event.shiftKey,
			alt: event.altKey,
		};

		updateKeybind(recording, config);
		stopRecording();
	}

	function isDefault(action: KeybindAction): boolean {
		const current = keybinds[action];
		const defaultConfig = DEFAULT_KEYBINDS[action];
		return (
			current.key === defaultConfig.key &&
			!!current.ctrl === !!defaultConfig.ctrl &&
			!!current.shift === !!defaultConfig.shift &&
			!!current.alt === !!defaultConfig.alt
		);
	}
</script>

<svelte:head>
	<title>Keybinds | nanochat</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-wrap items-start justify-between gap-4">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold tracking-tight">Keyboard Shortcuts</h1>
		<p class="text-muted-foreground text-sm">
			Customize your keyboard shortcuts. Click on a keybind to change it.
		</p>
	</div>
	<Button variant="outline" size="sm" onclick={resetAllKeybinds}>
		<RotateCcwIcon class="mr-2 size-4" />
		Reset All
	</Button>
</div>

<div class="mt-6 space-y-6">
	<div class="bg-card border-border divide-border divide-y rounded-lg border">
		{#each KEYBIND_ACTIONS as action (action)}
			{@const isRecordingThis = recording === action}
			{@const isDefaultValue = isDefault(action)}
			<div class="flex items-center justify-between gap-4 px-5 py-3">
				<div class="flex flex-col">
					<span class="font-medium">{KEYBIND_LABELS[action]}</span>
					{#if !isDefaultValue}
						<span class="text-muted-foreground text-xs">Modified from default</span>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={() => (isRecordingThis ? stopRecording() : startRecording(action))}
						class={cn(
							'flex min-w-[160px] items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
							isRecordingThis
								? 'border-primary bg-primary/10 text-primary ring-primary/20 ring-2'
								: 'border-input bg-background hover:bg-accent'
						)}
					>
						{#if isRecordingThis}
							<span class="bg-primary size-2 animate-pulse rounded-full"></span>
							<span class="text-primary font-medium">Press keys…</span>
						{:else}
							{#each formatKeybind(keybinds[action]) as key}
								<Kbd size="sm">{key}</Kbd>
							{/each}
						{/if}
					</button>

					{#if !isDefaultValue}
						<Button
							variant="ghost"
							size="icon"
							class="size-8"
							onclick={() => resetKeybind(action)}
							title="Reset to default"
						>
							<RotateCcwIcon class="size-4" />
						</Button>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="text-muted-foreground space-y-1 text-xs">
		<p class="flex flex-wrap items-center gap-1.5">
			<strong class="text-foreground">Tip:</strong>
			<span>Press</span>
			<Kbd size="sm">{isMac ? '⌘' : 'Ctrl'}</Kbd>
			<span>+</span>
			<Kbd size="sm">key</Kbd>
			<span>for ctrl/cmd shortcuts.</span>
		</p>
		<p>Changes are saved automatically and persist across browser sessions.</p>
	</div>
</div>
