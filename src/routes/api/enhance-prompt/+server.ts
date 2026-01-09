import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { z } from 'zod/v4';

import { OpenAI } from 'openai';
import { parseMessageForRules } from '$lib/utils/rules';
import { Provider } from '$lib/types';
import { db } from '$lib/db';
import { userKeys, userRules } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptApiKey, isEncrypted } from '$lib/encryption';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

const MODEL = 'zai-org/glm-4.6v';

const reqBodySchema = z.object({
	prompt: z.string(),
});

export type EnhancePromptRequestBody = z.infer<typeof reqBodySchema>;

export type EnhancePromptResponse = {
	ok: true;
	enhanced_prompt: string;
};

function response({ enhanced_prompt }: { enhanced_prompt: string }) {
	return json({
		ok: true,
		enhanced_prompt,
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		return error(400, 'Failed to parse request body');
	}

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		return error(400, parsed.error);
	}
	const args = parsed.data;

	const userId = await getAuthenticatedUserId(request);

	// Get rules and API key from local database
	const [rules, keyRecord] = await Promise.all([
		db.query.userRules.findMany({
			where: eq(userRules.userId, userId),
		}),
		db.query.userKeys.findFirst({
			where: and(
				eq(userKeys.userId, userId),
				eq(userKeys.provider, Provider.NanoGPT)
			),
		}),
	]);

	let apiKey = keyRecord?.key;
	if (apiKey && isEncrypted(apiKey)) {
		apiKey = decryptApiKey(apiKey);
	}
	if (!apiKey && process.env.NANOGPT_API_KEY) {
		apiKey = process.env.NANOGPT_API_KEY;
	}

	if (!apiKey) {
		return error(403, 'NanoGPT API key required to enhance prompts');
	}

	const mentionedRules = parseMessageForRules(
		args.prompt,
		rules.filter((r) => r.attach === 'manual')
	);

	const openai = new OpenAI({
		baseURL: 'https://nano-gpt.com/api/v1',
		apiKey: apiKey,
	});

	const enhancePrompt = `
Enhance prompt below (wrapped in <prompt> tags) so that it can be better understood by LLMs You job is not to answer the prompt but simply prepare it to be answered by another LLM. 
You can do this by fixing spelling/grammatical errors, clarifying details, and removing unnecessary wording where possible.
Only return the enhanced prompt, nothing else. Do NOT wrap it in quotes, do NOT use markdown.
Do NOT respond to the prompt only optimize it so that another LLM can understand it better.
Do NOT remove context that may be necessary for the prompt to be understood.

${mentionedRules.length > 0
			? `The user has mentioned rules with the @<rule_name> syntax. Make sure to include the rules in the final prompt even if you just add them to the end.
Mentioned rules: ${mentionedRules.map((r) => `@${r.name}`).join(', ')}`
			: ''
		}

<prompt>
${args.prompt}
</prompt>
`;

	const enhancedResult = await ResultAsync.fromPromise(
		openai.chat.completions.create({
			model: MODEL,
			messages: [{ role: 'user', content: enhancePrompt }],
			temperature: 0.5,
		}),
		(e) => `Enhance prompt API call failed: ${e}`
	);

	if (enhancedResult.isErr()) {
		return error(500, 'error enhancing the prompt');
	}

	const enhancedResponse = enhancedResult.value;
	const enhanced = enhancedResponse.choices[0]?.message?.content;

	if (!enhanced) {
		return error(500, 'error enhancing the prompt');
	}

	return response({
		enhanced_prompt: enhanced,
	});
};
