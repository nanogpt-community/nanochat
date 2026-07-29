import { useResizeObserver, watch, extract } from 'runed';
import { onDestroy } from 'svelte';
import type { Action } from 'svelte/action';
import { on } from 'svelte/events';

export interface TextareaAutosizeOptions {
	/** Function called when the textarea size changes. */
	onResize?: () => void;
	/**
	 * Specify the style property that will be used to manipulate height. Can be `height | minHeight`.
	 * @default `height`
	 **/
	styleProp?: 'height' | 'minHeight';
	/**
	 * Maximum height of the textarea before enabling scrolling.
	 * @default `undefined` (no maximum)
	 */
	maxHeight?: number;
}

export class TextareaAutosize {
	#options: TextareaAutosizeOptions;
	#resizeTimeout: number | null = null;
	#hiddenTextarea: HTMLTextAreaElement | null = null;

	element: HTMLTextAreaElement | undefined;
	#input = '';
	styleProp = $derived.by(() => extract(this.#options.styleProp, 'height'));
	maxHeight = $derived.by(() => extract(this.#options.maxHeight, undefined));
	textareaHeight = $state(0);
	textareaOldWidth = $state(0);
	/** Cleared whenever something that affects text metrics may have changed. */
	#stylesAreCurrent = false;

	constructor(options: TextareaAutosizeOptions = {}) {
		this.#options = options;

		// Create hidden textarea for measurements
		this.#createHiddenTextarea();

		watch(
			() => this.textareaHeight,
			() => options?.onResize?.()
		);

		useResizeObserver(
			() => this.element,
			([entry]) => {
				if (!entry) return;
				const { contentRect } = entry;
				if (this.textareaOldWidth === contentRect.width) return;

				this.textareaOldWidth = contentRect.width;
				this.#stylesAreCurrent = false;
				this.triggerResize();
			}
		);

		onDestroy(() => {
			// Clean up
			if (this.#hiddenTextarea) {
				this.#hiddenTextarea.remove();
				this.#hiddenTextarea = null;
			}

			if (this.#resizeTimeout) {
				window.cancelAnimationFrame(this.#resizeTimeout);
				this.#resizeTimeout = null;
			}
		});
	}

	#createHiddenTextarea() {
		// Create a hidden textarea that will be used for measurements
		// This avoids layout shifts caused by manipulating the actual textarea
		if (typeof window === 'undefined') return;

		this.#hiddenTextarea = document.createElement('textarea');
		const style = this.#hiddenTextarea.style;

		// Make it invisible but keep same text layout properties
		style.visibility = 'hidden';
		style.position = 'absolute';
		style.overflow = 'hidden';
		style.height = '0';
		style.top = '0';
		style.left = '-9999px';

		document.body.appendChild(this.#hiddenTextarea);
	}

	/**
	 * Mirror the real textarea's text-layout styles onto the hidden measuring one.
	 *
	 * This runs from triggerResize(), which fires on every keystroke — and
	 * getComputedStyle plus 21 getPropertyValue reads followed by 21 style writes is
	 * a forced synchronous layout each time, over the whole document. None of those
	 * properties can change from typing, only from a resize or a font/padding change,
	 * both of which already invalidate via the ResizeObserver below.
	 */
	#copyStyles() {
		if (!this.element || !this.#hiddenTextarea) return;
		if (this.#stylesAreCurrent) return;

		const computed = window.getComputedStyle(this.element);

		// Copy all the styles that affect text layout
		const stylesToCopy = [
			'box-sizing',
			'width',
			'padding-top',
			'padding-right',
			'padding-bottom',
			'padding-left',
			'border-top-width',
			'border-right-width',
			'border-bottom-width',
			'border-left-width',
			'font-family',
			'font-size',
			'font-weight',
			'font-style',
			'letter-spacing',
			'text-indent',
			'text-transform',
			'line-height',
			'word-spacing',
			'word-wrap',
			'word-break',
			'white-space',
		];

		stylesToCopy.forEach((style) => {
			this.#hiddenTextarea!.style.setProperty(style, computed.getPropertyValue(style));
		});

		// Ensure the width matches exactly
		this.#hiddenTextarea.style.width = `${this.element.clientWidth}px`;
		this.#stylesAreCurrent = true;
	}

	triggerResize = () => {
		if (!this.element || !this.#hiddenTextarea) return;

		// Copy current styles and content to hidden textarea
		this.#copyStyles();
		this.#hiddenTextarea.value = this.#input || '';

		// Measure the hidden textarea
		const scrollHeight = this.#hiddenTextarea.scrollHeight;

		// Apply the height, respecting maxHeight if set
		let newHeight = scrollHeight;
		if (this.maxHeight && newHeight > this.maxHeight) {
			newHeight = this.maxHeight;
			this.element.style.overflowY = 'auto';
		} else {
			this.element.style.overflowY = 'hidden';
		}

		// Only update if height actually changed
		if (this.textareaHeight !== newHeight) {
			this.textareaHeight = newHeight;
			this.element.style[this.styleProp] = `${newHeight}px`;
		}
	};

	attachment: Action<HTMLTextAreaElement> = (node) => {
		this.element = node;
		this.#input = node.value;
		// A different element means different computed styles.
		this.#stylesAreCurrent = false;

		// Detect programmatic changes
		const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
		Object.defineProperty(node, 'value', {
			get: desc.get,
			set: (v) => {
				this.#input = v;
				queueMicrotask(this.triggerResize);
				desc.set?.call(node, v);
			},
		});

		queueMicrotask(this.triggerResize);

		const removeListener = on(node, 'input', () => {
			this.#input = node.value;
			this.triggerResize();
		});

		return {
			destroy: () => {
				removeListener();
				this.#input = '';
				this.element = undefined;
			},
		};
	};
}
