import { describe, expect, it } from 'vitest';

// remote-mcp pulls in the db module, which throws without a connection string.
// postgres.js connects lazily, so a placeholder is enough for these pure checks.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';

const { prefixedName } = await import('./remote-mcp');

/** OpenAI rejects anything outside this. A rejected name kills the whole request. */
const OPENAI_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

describe('prefixedName', () => {
	it('produces a legal OpenAI tool name from awkward input', () => {
		expect(prefixedName('My Server!', 'search/docs')).toMatch(OPENAI_TOOL_NAME);
		expect(prefixedName('linear', 'create_issue')).toBe('mcp_linear_create_issue');
	});

	it('stays within 64 chars even when both parts are long', () => {
		const name = prefixedName('s'.repeat(200), 't'.repeat(200));
		expect(name.length).toBeLessThanOrEqual(64);
		expect(name).toMatch(OPENAI_TOOL_NAME);
	});

	it('keeps tools distinct when a long server name would otherwise truncate them away', () => {
		const server = 'a-really-very-extremely-long-mcp-server-name-that-overflows';
		expect(prefixedName(server, 'list_issues')).not.toBe(prefixedName(server, 'create_issue'));
	});

	it('keeps servers distinct for the same tool name', () => {
		expect(prefixedName('linear', 'search')).not.toBe(prefixedName('notion', 'search'));
	});
});
