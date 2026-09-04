import { describe, expect, it } from 'vitest';
import { mergeToolCallDeltas, type ToolCall } from './tools';

describe('mergeToolCallDeltas', () => {
	it('assembles fragmented tool calls by index', () => {
		const calls: ToolCall[] = [];
		mergeToolCallDeltas(calls, [
			{ index: 0, id: 'call_1', function: { name: 'nano', arguments: '{"a"' } },
		]);
		mergeToolCallDeltas(calls, [
			{ index: 0, function: { name: 'gpt_web_search', arguments: ':1}' } },
		]);
		mergeToolCallDeltas(calls, [
			{ index: 1, id: 'call_2', function: { name: 'x', arguments: '{}' } },
		]);
		expect(calls).toEqual([
			{
				id: 'call_1',
				type: 'function',
				function: { name: 'nanogpt_web_search', arguments: '{"a":1}' },
			},
			{ id: 'call_2', type: 'function', function: { name: 'x', arguments: '{}' } },
		]);
	});

	it('ignores malformed indexes and non-array input', () => {
		const calls: ToolCall[] = [];
		mergeToolCallDeltas(calls, [{ index: -1, id: 'bad' }, { index: '__proto__' }]);
		mergeToolCallDeltas(calls, undefined);
		expect(calls).toEqual([]);
	});
});
