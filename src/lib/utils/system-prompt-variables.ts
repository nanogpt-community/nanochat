/**
 * Substitutes variables in system prompts with actual values
 * 
 * Supported variables:
 * - {cur_date} - Current date in YYYY-MM-DD format
 * - {cur_time} - Current time in HH:MM:SS format
 * - {cur_datetime} - Current date and time in ISO format
 * - {model_name} - Name of the current AI model
 * - {model_id} - ID of the current AI model
 * - {provider} - Provider name (e.g., 'nano-gpt')
 * - {user_name} - Name of the current user
 */

export interface SystemPromptContext {
	modelName?: string;
	modelId?: string;
	provider?: string;
	userName?: string;
}

export function substituteSystemPromptVariables(
	prompt: string,
	context: SystemPromptContext
): string {
	const now = new Date();
	
	// Format date as YYYY-MM-DD
	const curDate = now.toISOString().split('T')[0];
	
	// Format time as HH:MM:SS
	const curTime = now.toTimeString().split(' ')[0];
	
	// Full datetime in ISO format
	const curDatetime = now.toISOString();
	
	const variables: Record<string, string> = {
		'{cur_date}': curDate ?? '',
		'{cur_time}': curTime ?? '',
		'{cur_datetime}': curDatetime ?? '',
		'{model_name}': context.modelName ?? context.modelId ?? '',
		'{model_id}': context.modelId ?? '',
		'{provider}': context.provider ?? '',
		'{user_name}': context.userName ?? '',
	};
	
	let result = prompt;
	for (const [variable, value] of Object.entries(variables)) {
		result = result.replaceAll(variable, value);
	}
	
	return result;
}
