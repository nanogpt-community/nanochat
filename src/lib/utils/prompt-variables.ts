/**
 * Prompt variable utilities for user-defined variables in prompt templates.
 *
 * Variable syntax: {{variable_name}} or {{variable_name:default_value}}
 * This is distinct from system variables which use single braces: {cur_date}, {model_name}, etc.
 */

export interface PromptVariable {
	name: string;
	defaultValue?: string;
	description?: string;
}

// Matches {{variable_name}} or {{variable_name:default_value}}
const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}\}/g;

/**
 * Extract variables from prompt content.
 * Detects {{variable_name}} and {{variable_name:default_value}} patterns.
 */
export function extractVariables(content: string): PromptVariable[] {
	const variables: PromptVariable[] = [];
	const seen = new Set<string>();

	let match;
	// Reset regex state
	VARIABLE_REGEX.lastIndex = 0;

	while ((match = VARIABLE_REGEX.exec(content)) !== null) {
		const name = match[1] as string;
		const defaultValue = match[2] as string | undefined;

		if (!seen.has(name)) {
			seen.add(name);
			variables.push({
				name,
				defaultValue: defaultValue || undefined,
			});
		}
	}

	return variables;
}

/**
 * Substitute variables in prompt content with provided values.
 * Falls back to default value if no value provided, or leaves placeholder if neither exists.
 */
export function substitutePromptVariables(content: string, values: Record<string, string>): string {
	return content.replace(VARIABLE_REGEX, (match, name, defaultValue) => {
		if (values[name] !== undefined && values[name] !== '') {
			return values[name];
		}
		if (defaultValue !== undefined) {
			return defaultValue;
		}
		return match;
	});
}

/**
 * Check if prompt content has any unfilled variables after substitution.
 */
export function hasUnfilledVariables(content: string, values: Record<string, string>): boolean {
	const substituted = substitutePromptVariables(content, values);
	// Reset regex state
	VARIABLE_REGEX.lastIndex = 0;
	return VARIABLE_REGEX.test(substituted);
}

/**
 * Get list of variable names that are still unfilled after substitution.
 */
export function getUnfilledVariables(content: string, values: Record<string, string>): string[] {
	const allVars = extractVariables(content);
	return allVars
		.filter((v) => {
			const hasValue = values[v.name] !== undefined && values[v.name] !== '';
			const hasDefault = v.defaultValue !== undefined;
			return !hasValue && !hasDefault;
		})
		.map((v) => v.name);
}

/**
 * Highlight variables in content for preview display.
 * Returns HTML with variables wrapped in <mark> tags.
 */
export function highlightVariables(content: string): string {
	return content.replace(VARIABLE_REGEX, (match) => {
		return `<mark class="bg-primary/20 text-primary rounded px-0.5">${match}</mark>`;
	});
}
