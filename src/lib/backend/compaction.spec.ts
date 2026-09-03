import { describe, expect, it } from 'vitest';
import { estimateMessagesTokens, planCompaction, KEEP_TAIL } from './compaction';

describe('planCompaction', () => {
	it('does nothing under the threshold', () => {
		expect(
			planCompaction({
				startIndex: 0,
				messageCount: 20,
				usedTokens: 79_000,
				contextLength: 100_000,
				thresholdPercent: 80,
			})
		).toBeNull();
	});

	it('summarizes everything but the tail once over the threshold', () => {
		expect(
			planCompaction({
				startIndex: 0,
				messageCount: 20,
				usedTokens: 81_000,
				contextLength: 100_000,
				thresholdPercent: 80,
			})
		).toEqual({ from: 0, to: 20 - KEEP_TAIL });
	});

	it('continues from a previous compaction point', () => {
		expect(
			planCompaction({
				startIndex: 15,
				messageCount: 30,
				usedTokens: 90_000,
				contextLength: 100_000,
				thresholdPercent: 80,
			})
		).toEqual({ from: 15, to: 25 });
	});

	it('gives up when only the tail remains', () => {
		expect(
			planCompaction({
				startIndex: 15,
				messageCount: 18,
				usedTokens: 90_000,
				contextLength: 100_000,
				thresholdPercent: 80,
			})
		).toBeNull();
	});
});

describe('estimateMessagesTokens', () => {
	it('counts text parts and charges a flat rate for images', () => {
		const text = 'x'.repeat(400);
		expect(estimateMessagesTokens([{ role: 'user', content: text }])).toBe(104);
		expect(
			estimateMessagesTokens([
				{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url' }] },
			])
		).toBe(1104);
	});
});
