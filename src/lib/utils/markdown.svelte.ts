import type { Getter } from 'runed';
import { md } from './markdown-it';

/**
 * Renders markdown, coalescing bursts of updates down to one render per frame.
 *
 * Streaming delivers 30-80 SSE deltas per second and each one re-renders the whole
 * message, so an unthrottled render loop costs more per second than there is time in
 * a second once a message contains a few KB of code. Two guarantees matter here:
 * renders never overlap, and the last content always wins.
 */
export class Markdown {
	highlighted = $state<string | null>(null);

	/** Newest content not yet handed to the renderer. */
	#pending: string | null = null;
	/** A render is in flight; do not start another. */
	#running = false;
	#frame: number | null = null;
	/** Bumped per render so a slow one cannot overwrite a newer result. */
	#generation = 0;

	constructor(readonly code: Getter<string>) {
		$effect(() => {
			this.#pending = this.code();
			this.#schedule();

			return () => {
				if (this.#frame !== null) cancelAnimationFrame(this.#frame);
				this.#frame = null;
				this.#pending = null;
				// Invalidate anything still in flight so it cannot assign after teardown.
				this.#generation++;
			};
		});
	}

	#schedule() {
		if (this.#frame !== null || this.#running) return;
		this.#frame = requestAnimationFrame(() => {
			this.#frame = null;
			this.#flush();
		});
	}

	#flush() {
		const content = this.#pending;
		if (content === null) return;
		this.#pending = null;
		this.#running = true;

		const generation = ++this.#generation;
		md.renderAsync(content)
			.then((html) => {
				// A lazily-loaded grammar can make an older render resolve last; without
				// this guard it would rewind the message to stale content.
				if (generation === this.#generation) this.highlighted = html;
			})
			.catch(() => {})
			.finally(() => {
				this.#running = false;
				// Content that arrived while we were rendering.
				if (this.#pending !== null) this.#schedule();
			});
	}

	get current() {
		return this.highlighted;
	}
}
