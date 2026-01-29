import { createPersistedObj } from '$lib/spells/persisted-obj.svelte';
import type { Key } from '$lib/actions/shortcut.svelte';

/**
 * Available keyboard shortcut actions that can be customized.
 */
export type KeybindAction =
	| 'toggleSidebar'
	| 'newChat'
	| 'searchMessages'
	| 'scrollToBottom'
	| 'openModelPicker'
	| 'openPromptPicker'
	| 'pinModel';

/**
 * Configuration for a single keybind.
 */
export type KeybindConfig = {
	key: Key;
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
};

/**
 * Human-readable labels for each keybind action.
 */
export const KEYBIND_LABELS: Record<KeybindAction, string> = {
	toggleSidebar: 'Toggle Sidebar',
	newChat: 'New Chat',
	searchMessages: 'Search Messages',
	scrollToBottom: 'Scroll to Bottom',
	openModelPicker: 'Open Model Picker',
	openPromptPicker: 'Open Prompt Picker',
	pinModel: 'Pin/Unpin Model',
};

/**
 * Default keybind configurations.
 */
export const DEFAULT_KEYBINDS: Record<KeybindAction, KeybindConfig> = {
	toggleSidebar: { key: 'b', ctrl: true },
	newChat: { key: 'o', ctrl: true, shift: true },
	searchMessages: { key: 'k', ctrl: true },
	scrollToBottom: { key: 'd', ctrl: true },
	openModelPicker: { key: 'm', ctrl: true, shift: true },
	openPromptPicker: { key: 'p', ctrl: true },
	pinModel: { key: 'u', ctrl: true },
};

/**
 * Persisted keybind settings stored in localStorage.
 */
export const keybinds = createPersistedObj('keybinds', DEFAULT_KEYBINDS);

/**
 * Get all keybind actions as an array.
 */
export const KEYBIND_ACTIONS: KeybindAction[] = [
	'toggleSidebar',
	'newChat',
	'searchMessages',
	'scrollToBottom',
	'openModelPicker',
	'openPromptPicker',
	'pinModel',
];

/**
 * Reset a specific keybind to its default value.
 */
export function resetKeybind(action: KeybindAction): void {
	const defaultConfig = DEFAULT_KEYBINDS[action];
	keybinds[action] = { ...defaultConfig };
}

/**
 * Reset all keybinds to their default values.
 */
export function resetAllKeybinds(): void {
	for (const action of KEYBIND_ACTIONS) {
		resetKeybind(action);
	}
}

/**
 * Update a keybind with a new configuration.
 */
export function updateKeybind(action: KeybindAction, config: KeybindConfig): void {
	keybinds[action] = config;
}
