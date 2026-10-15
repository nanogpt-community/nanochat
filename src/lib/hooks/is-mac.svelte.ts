import type { KeybindConfig } from '#lib/state/keybinds.svelte.js';

/** Attempts to determine if a user is on a Mac using `navigator.userAgent`. */
export const isMac = navigator.userAgent.includes('Mac');

/** `⌘` for mac or `Ctrl` for windows */
export const cmdOrCtrl = isMac ? '⌘' : 'Ctrl';
/** `⌥` for mac or `Alt` for windows */
export const optionOrAlt = isMac ? '⌥' : 'Alt';

/**
 * Format a keybind configuration for display.
 * Returns an array of key labels to display (e.g., ['⌘', 'Shift', 'O']).
 */
export function formatKeybind(config: KeybindConfig): string[] {
	const keys: string[] = [];
	if (config.ctrl) keys.push(cmdOrCtrl);
	if (config.shift) keys.push('Shift');
	if (config.alt) keys.push(optionOrAlt);
	keys.push(config.key.toUpperCase());
	return keys;
}
