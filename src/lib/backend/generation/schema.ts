import { z } from 'zod/v4';
import { REASONING_EFFORTS } from '$lib/utils/model-capabilities';

/** Per message. Each document is parsed on every turn it stays in context. */
export const MAX_ATTACHMENTS = 10;

export const WEB_SEARCH_PROVIDERS = [
	'linkup',
	'tavily',
	'exa',
	'kagi',
	'perplexity',
	'valyu',
	'brave',
	'brave-pro',
	'brave-research',
] as const;

export const generateMessageRequestSchema = z
	.object({
		message: z.string().optional(),
		model_id: z.string(),
		assistant_id: z.string().optional(),
		project_id: z.string().optional(),
		conversation_id: z.string().optional(),
		web_search_enabled: z.boolean().optional(),
		web_search_mode: z.enum(['off', 'standard', 'deep']).optional(),
		web_search_provider: z.enum(WEB_SEARCH_PROVIDERS).optional(),
		web_search_exa_depth: z.enum(['fast', 'auto', 'neural', 'deep']).optional(),
		web_search_context_size: z.enum(['low', 'medium', 'high']).optional(),
		web_search_kagi_source: z.enum(['web', 'news', 'search']).optional(),
		web_search_valyu_search_type: z.enum(['all', 'web']).optional(),
		images: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
				})
			)
			.max(MAX_ATTACHMENTS)
			.optional(),
		documents: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
					fileType: z.enum(['pdf', 'markdown', 'text', 'epub']),
				})
			)
			.max(MAX_ATTACHMENTS)
			.optional(),
		reasoning_effort: z.enum(REASONING_EFFORTS).optional(),
		temporary: z.boolean().optional(),
		provider_id: z.string().optional(), // X-Provider header for provider selection
		image_params: z.record(z.string(), z.any()).optional(), // Image generation settings (non-streaming only)
	})
	.refine((data) => !(data.conversation_id === undefined && data.message === undefined), {
		message: 'You must provide a message when creating a new conversation',
	});

export type GenerateMessageRequestBody = z.infer<typeof generateMessageRequestSchema>;

export type GenerateMessageResponse = {
	ok: true;
	conversation_id: string;
};

export type Log = (message: string) => void;
