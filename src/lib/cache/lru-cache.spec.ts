import { describe, expect, it } from 'vitest';
import { LRUCache } from './lru-cache';

/** Mirrors the shape actually cached: a conversation's message list. */
function conversation(count: number, contentLength = 900) {
	return Array.from({ length: count }, (_, i) => ({
		id: `m${i}`,
		conversationId: 'c1',
		role: i % 2 ? 'assistant' : 'user',
		content: 'x'.repeat(contentLength),
		contentHtml: `<p>${'y'.repeat(contentLength)}</p>`,
		reasoning: null,
		tokenCount: 120,
		costUsd: 0.0001,
		starred: false,
		createdAt: new Date(),
		images: null,
	}));
}

/** Estimated byte size of one entry, so tests can express capacity in entries. */
function entrySize(value: unknown): number {
	const probe = new LRUCache<string, unknown>(Number.MAX_SAFE_INTEGER);
	probe.set('probe', value);
	return probe.bytes;
}

describe('LRUCache size estimation', () => {
	it('approximates serialised size without serialising', () => {
		const value = conversation(120);
		const actual = new Blob([JSON.stringify(value)]).size;

		// Within 25% of the real JSON byte count. The first version of this estimator
		// measured UTF-16 code units and came out ~1.9x high, which would have silently
		// halved the cache's effective capacity.
		const estimated = entrySize(value);
		expect(estimated).toBeGreaterThan(actual * 0.75);
		expect(estimated).toBeLessThan(actual * 1.25);
	});

	it('scales with content rather than reporting a constant', () => {
		expect(entrySize(conversation(40))).toBeGreaterThan(entrySize(conversation(10)));
	});

	it('terminates on cyclic values instead of hanging', () => {
		const cyclic: Record<string, unknown> = { n: 1 };
		cyclic.self = cyclic;
		expect(typeof entrySize(cyclic)).toBe('number');
	});
});

describe('LRUCache eviction', () => {
	it('evicts the least recently used entry when over capacity', () => {
		const one = entrySize({ v: 'x'.repeat(1000) });
		const cache = new LRUCache<string, unknown>(one * 2 + 1);

		cache.set('a', { v: 'x'.repeat(1000) });
		cache.set('b', { v: 'y'.repeat(1000) });
		cache.set('c', { v: 'z'.repeat(1000) });

		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBeDefined();
		expect(cache.get('c')).toBeDefined();
	});

	it('treats a read as a use, so the untouched entry is evicted', () => {
		const one = entrySize({ v: 'x'.repeat(1000) });
		const cache = new LRUCache<string, unknown>(one * 2 + 1);

		cache.set('a', { v: 'x'.repeat(1000) });
		cache.set('b', { v: 'y'.repeat(1000) });
		cache.get('a'); // 'b' is now the least recently used
		cache.set('c', { v: 'z'.repeat(1000) });

		expect(cache.get('a')).toBeDefined();
		expect(cache.get('b')).toBeUndefined();
	});

	it('replaces rather than duplicates when a key is set twice', () => {
		const cache = new LRUCache<string, unknown>(Number.MAX_SAFE_INTEGER);
		cache.set('a', { v: 'first' });
		cache.set('a', { v: 'second' });

		expect(cache.get('a')).toEqual({ v: 'second' });
		expect(cache.size).toBe(1);
	});
});
