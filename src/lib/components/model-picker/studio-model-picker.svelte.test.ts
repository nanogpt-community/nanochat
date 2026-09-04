import { describe, expect, it, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import StudioModelPicker from './studio-model-picker.svelte';

beforeAll(() => {
	// jsdom has no <dialog> implementation; mirror the open attribute like a browser would.
	HTMLDialogElement.prototype.showModal = function () {
		this.setAttribute('open', '');
	};
	HTMLDialogElement.prototype.close = function () {
		this.removeAttribute('open');
		this.dispatchEvent(new Event('close'));
	};
	Object.defineProperty(HTMLDialogElement.prototype, 'open', {
		get() {
			return this.hasAttribute('open');
		},
		configurable: true,
	});
});

const models = [
	{ id: 'a/one', name: 'One', created: 1, description: 'first' },
	{ id: 'b/two', name: 'Two', created: 2, description: 'second' },
] as never[];

describe('StudioModelPicker', () => {
	it('closes after a model is picked and reports the selection', async () => {
		const { container, getByText, getAllByText } = render(StudioModelPicker, {
			models,
			value: 'a/one',
		});
		const dialog = container.querySelector('dialog')!;
		const trigger = container.querySelector('button')!;

		await fireEvent.click(trigger);
		expect(dialog.hasAttribute('open')).toBe(true);

		await fireEvent.click(getByText('Two'));
		expect(dialog.hasAttribute('open')).toBe(false);
		// trigger label now shows the new selection (list row + trigger)
		expect(getAllByText('Two').length).toBe(2);

		await fireEvent.click(trigger);
		expect(dialog.hasAttribute('open')).toBe(true);
		await fireEvent.click(container.querySelector('button[aria-label="Close"]')!);
		expect(dialog.hasAttribute('open')).toBe(false);
	});
});
