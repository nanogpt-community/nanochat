/**
 * Substitutes variables in system prompts with actual values
 *
 * Supported variables (both {curly} and <ANGLE> bracket formats):
 *
 * Model Information:
 * - {model_name} or <LLM_MODEL> - Name of the current AI model
 * - {model_id} - ID of the current AI model
 * - {provider} - Provider name (e.g., 'nano-gpt')
 *
 * Date/Time (in user's local timezone):
 * - {cur_date} or <CURRENT_DATE> - Current date (e.g., "January 21, 2026")
 * - {cur_time} or <CURRENT_TIME> - Current time (e.g., "2:30 PM")
 * - {cur_datetime} or <CURRENT_DATETIME> - Full date and time (e.g., "January 21, 2026, 2:30 PM")
 * - {cur_date_iso} - Current date in ISO format (YYYY-MM-DD)
 * - {cur_time_24h} - Current time in 24-hour format (HH:MM:SS)
 * - {cur_datetime_iso} - Full datetime in ISO format
 *
 * User Information:
 * - {user_name} or <USER_NAME> - Name of the current user
 */

export interface SystemPromptContext {
	modelName?: string;
	modelId?: string;
	provider?: string;
	userName?: string;
	timezone?: string;
}

export function substituteSystemPromptVariables(
	prompt: string,
	context: SystemPromptContext
): string {
	const now = new Date();
	const timezone = context.timezone || 'UTC';

	// Human-readable date (e.g., "January 21, 2026")
	const curDateHuman = now.toLocaleDateString('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});

	// Human-readable time (e.g., "2:30 PM")
	const curTimeHuman = now.toLocaleTimeString('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});

	// Human-readable datetime (e.g., "January 21, 2026, 2:30 PM")
	const curDatetimeHuman = now.toLocaleString('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});

	// ISO format date (YYYY-MM-DD)
	const curDateIso = now.toISOString().split('T')[0] ?? '';

	// 24-hour time format (HH:MM:SS)
	const curTime24h = now.toTimeString().split(' ')[0] ?? '';

	// Full ISO datetime
	const curDatetimeIso = now.toISOString();

	const modelValue = context.modelName ?? context.modelId ?? '';
	const modelIdValue = context.modelId ?? '';
	const providerValue = context.provider ?? '';
	const userNameValue = context.userName ?? '';

	const variables: Record<string, string> = {
		// Curly brace format (original)
		'{cur_date}': curDateHuman,
		'{cur_time}': curTimeHuman,
		'{cur_datetime}': curDatetimeHuman,
		'{cur_date_iso}': curDateIso,
		'{cur_time_24h}': curTime24h,
		'{cur_datetime_iso}': curDatetimeIso,
		'{model_name}': modelValue,
		'{model_id}': modelIdValue,
		'{provider}': providerValue,
		'{user_name}': userNameValue,

		// Angle bracket format (compatible with other tools)
		'<LLM_MODEL>': modelValue,
		'<CURRENT_DATE>': curDateHuman,
		'<CURRENT_TIME>': curTimeHuman,
		'<CURRENT_DATETIME>': curDatetimeHuman,
		'<USER_NAME>': userNameValue,
	};

	let result = prompt;
	for (const [variable, value] of Object.entries(variables)) {
		result = result.replaceAll(variable, value);
	}

	return result;
}
