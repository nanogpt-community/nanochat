import { describe, expect, it } from 'vitest';
import { parseMemoryOps, formatMemoriesForPrompt } from './memory';

describe('parseMemoryOps', () => {
	it('parses a well-formed response wrapped in prose or fences', () => {
		const ops = parseMemoryOps(
			'```json\n{"add":["User likes Go"],"update":[{"id":"a","content":"x"}],"delete":["b"]}\n```'
		);
		expect(ops).toEqual({
			add: ['User likes Go'],
			update: [{ id: 'a', content: 'x' }],
			delete: ['b'],
		});
	});

	it('drops malformed entries and tolerates missing keys', () => {
		expect(parseMemoryOps('{"add":[1,"ok"],"update":[{"id":"a"}]}')).toEqual({
			add: ['ok'],
			update: [],
			delete: [],
		});
	});

	it('returns null when there is no JSON', () => {
		expect(parseMemoryOps('nothing to remember')).toBeNull();
	});
});

describe('formatMemoriesForPrompt', () => {
	it('is empty with no memories and lists them otherwise', () => {
		expect(formatMemoriesForPrompt([])).toBe('');
		const now = new Date();
		const block = formatMemoriesForPrompt([
			{ id: '1', userId: 'u', content: 'User prefers tabs', createdAt: now, updatedAt: now },
		]);
		expect(block).toContain('[USER MEMORY]');
		expect(block).toContain('- User prefers tabs');
	});
});
