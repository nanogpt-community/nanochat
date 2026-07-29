import type { Getter } from 'runed';

/** How close to the bottom still counts as "pinned", in px. */
const PIN_THRESHOLD = 64;

/**
 * Tracks whether a scroller is pinned to the bottom, and keeps it pinned as content
 * grows — i.e. follows a streaming response without fighting a user who scrolls up.
 *
 * Replaces runed's `ScrollState`, which drives `setArrivedState()` from an
 * unconditional `AnimationFrames` loop: a `getComputedStyle` plus six scroll/size
 * reads on the conversation container every frame, forever, even while idle. Here
 * layout is only read when the user scrolls or the content actually resizes.
 */
export class ScrollAnchor {
	/** True when the viewport is at (or within PIN_THRESHOLD of) the bottom. */
	atBottom = $state(true);

	#container: Getter<HTMLElement | undefined>;
	#content: Getter<HTMLElement | undefined>;

	constructor(
		container: Getter<HTMLElement | undefined>,
		content: Getter<HTMLElement | undefined>
	) {
		this.#container = container;
		this.#content = content;

		$effect(() => {
			const el = this.#container();
			if (!el) return;

			const onScroll = () => {
				this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD;
			};
			onScroll();

			el.addEventListener('scroll', onScroll, { passive: true });
			return () => el.removeEventListener('scroll', onScroll);
		});

		$effect(() => {
			const el = this.#container();
			const content = this.#content();
			if (!el || !content) return;

			// Content growing while pinned means new tokens arrived: stay at the bottom.
			// 'instant' rather than 'smooth' — a smooth scroll per token queues up
			// animations that never settle while a response is streaming.
			const observer = new ResizeObserver(() => {
				if (this.atBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
			});
			observer.observe(content);
			return () => observer.disconnect();
		});
	}

	scrollToBottom(behavior: ScrollBehavior = 'smooth') {
		const el = this.#container();
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior });
		this.atBottom = true;
	}
}
