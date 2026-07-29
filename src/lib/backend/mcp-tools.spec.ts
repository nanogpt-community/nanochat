import { describe, expect, it } from 'vitest';
import { modelRejectsTools, noteToolsRejection } from './mcp-tools';

/**
 * Real responses observed from NanoGPT when a tools payload is attached.
 * The 400 is proof the model can't do tool calls; the 503 is a flaky upstream
 * provider and must NOT be remembered, or one blip disables tools until restart.
 */
describe('noteToolsRejection', () => {
	it('remembers a definitive tool-support rejection', () => {
		const model = 'zai-org/glm-5.2';
		expect(modelRejectsTools(model)).toBe(false);

		noteToolsRejection(
			model,
			new Error('400 This model does not support tool calls. code: tool_choice_unsupported')
		);
		expect(modelRejectsTools(model)).toBe(true);
	});

	it('does not remember a transient provider outage', () => {
		const model = 'moonshotai/kimi-k3';
		noteToolsRejection(
			model,
			new Error('503 The requested service is temporarily unavailable. Please try again later.')
		);
		expect(modelRejectsTools(model)).toBe(false);
	});

	it('does not remember unrelated failures', () => {
		const model = 'some/model';
		noteToolsRejection(model, new Error('429 rate limit exceeded'));
		noteToolsRejection(model, new Error('Invalid value for reasoning_effort: "medium"'));
		expect(modelRejectsTools(model)).toBe(false);
	});
});
