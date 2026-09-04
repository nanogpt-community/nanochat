export type Usage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
} | null;

/** Tool rounds are separate billable calls; sum them so cost isn't undercounted. */
export function addUsage(a: Usage, b: Usage): Usage {
	if (!a) return b;
	if (!b) return a;
	return {
		prompt_tokens: (a.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0),
		completion_tokens: (a.completion_tokens ?? 0) + (b.completion_tokens ?? 0),
		total_tokens: (a.total_tokens ?? 0) + (b.total_tokens ?? 0),
	};
}

function toFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Providers disagree on field names; accept the common spellings. */
export function normalizeUsageTokens(usage: Record<string, unknown>): {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
} {
	const promptTokens =
		toFiniteNumber(usage.prompt_tokens) ??
		toFiniteNumber(usage.input_tokens) ??
		toFiniteNumber(usage.promptTokens) ??
		toFiniteNumber(usage.tokens_prompt);
	const completionTokens =
		toFiniteNumber(usage.completion_tokens) ??
		toFiniteNumber(usage.output_tokens) ??
		toFiniteNumber(usage.completionTokens) ??
		toFiniteNumber(usage.tokens_completion);
	const totalTokens =
		toFiniteNumber(usage.total_tokens) ??
		toFiniteNumber(usage.totalTokens) ??
		toFiniteNumber(usage.tokens_total);
	return { promptTokens, completionTokens, totalTokens };
}
