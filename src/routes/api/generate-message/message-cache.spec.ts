import { describe, expect, it } from 'vitest';
import { applyLimit, upsertMessage } from './call';
import type { Message } from '$lib/api';

function message(id: string, overrides: Partial<Message> = {}): Message {
	return {
		id,
		conversationId: 'c1',
		role: 'user',
		content: `content ${id}`,
		contentHtml: null,
		reasoning: null,
		error: null,
		modelId: 'm',
		provider: 'nanogpt',
		tokenCount: null,
		responseTimeMs: null,
		timeToFirstTokenMs: null,
		images: null,
		documents: null,
		costUsd: null,
		generationId: null,
		webSearchEnabled: false,
		reasoningEffort: null,
		annotations: null,
		followUpSuggestions: null,
		starred: false,
		createdAt: new Date(),
		...overrides,
	} as Message;
}

describe('upsertMessage', () => {
	it('appends a message that is not already present', () => {
		const result = upsertMessage([message('a')], message('b'));
		expect(result.map((m) => m.id)).toEqual(['a', 'b']);
	});

	it('merges into the existing entry rather than duplicating it', () => {
		// This is what makes it safe to prime the same message into several cache
		// entries: re-applying must be a no-op, not a second copy.
		const existing = [message('a'), message('b')];
		const result = upsertMessage(existing, message('b', { content: 'updated' }));

		expect(result.map((m) => m.id)).toEqual(['a', 'b']);
		expect(result[1]?.content).toBe('updated');
	});

	it('is idempotent when the same message is applied repeatedly', () => {
		let acc = [message('a')];
		for (let i = 0; i < 5; i++) acc = upsertMessage(acc, message('b'));
		expect(acc.map((m) => m.id)).toEqual(['a', 'b']);
	});

	it('swaps an optimistic id for the real one via replaceId', () => {
		const optimistic = [message('a'), message('optimistic-1')];
		const result = upsertMessage(optimistic, message('real-1'), { replaceId: 'optimistic-1' });

		expect(result.map((m) => m.id)).toEqual(['a', 'real-1']);
		expect(result).toHaveLength(2);
	});

	it('does not mutate the array it was given', () => {
		const original = [message('a')];
		upsertMessage(original, message('b'));
		expect(original.map((m) => m.id)).toEqual(['a']);
	});
});

describe('applyLimit', () => {
	const five = ['a', 'b', 'c', 'd', 'e'].map((id) => message(id));

	it('keeps the newest N when over the limit', () => {
		expect(applyLimit(five, { limit: 2 }).map((m) => m.id)).toEqual(['d', 'e']);
	});

	it('leaves the list alone when under the limit', () => {
		expect(applyLimit(five, { limit: 50 })).toHaveLength(5);
	});

	it('treats a missing or unparseable limit as unlimited', () => {
		expect(applyLimit(five, undefined)).toHaveLength(5);
		expect(applyLimit(five, {})).toHaveLength(5);
		expect(applyLimit(five, { limit: 'not-a-number' })).toHaveLength(5);
	});

	it('accepts a numeric string limit, as it arrives from query params', () => {
		expect(applyLimit(five, { limit: '2' }).map((m) => m.id)).toEqual(['d', 'e']);
	});

	it('ignores a non-positive limit rather than emptying the list', () => {
		expect(applyLimit(five, { limit: 0 })).toHaveLength(5);
		expect(applyLimit(five, { limit: -3 })).toHaveLength(5);
	});
});
