import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { z } from 'zod/v4';
import { OpenAI } from 'openai';
import { parseMessageForRules } from '$lib/utils/rules';
import { db } from '$lib/db';
import { userRules } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { resolveNanoGptApiKey } from '$lib/backend/nanogpt-key.server';
import { getUserSettings } from '$lib/db/queries/user-settings';
import { DEFAULT_UTILITY_MODEL } from '$lib/backend/default-models';
import { assertSharedKeyUse } from '$lib/backend/shared-key-policy';

const reqBodySchema = z.object({
	prompt: z.string(),
});

export type EnhancePromptRequestBody = z.infer<typeof reqBodySchema>;

export type EnhancePromptResponse = {
	ok: true;
	enhanced_prompt: string;
};

export const POST: RequestHandler = async ({ request }) => {
	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);
	if (bodyResult.isErr()) return error(400, 'Failed to parse request body');

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) return error(400, parsed.error);
	const args = parsed.data;

	const userId = await getAuthenticatedUserId(request);

	const [rules, key, settings] = await Promise.all([
		db.query.userRules.findMany({ where: eq(userRules.userId, userId) }),
		resolveNanoGptApiKey(userId),
		getUserSettings(userId),
	]);
	if (!key) return error(403, 'NanoGPT API key required to enhance prompts');
	const utilityModel = settings?.utilityModelId || DEFAULT_UTILITY_MODEL;
	await assertSharedKeyUse({ userId, usingServerKey: key.usingServerKey, modelId: utilityModel });

	const mentionedRules = parseMessageForRules(
		args.prompt,
		rules.filter((r) => r.attach === 'manual')
	);

	const openai = new OpenAI({
		baseURL: nanoGptUrl('/api/v1'),
		apiKey: key.apiKey,
		defaultHeaders: settings?.utilityProviderId
			? { 'X-Provider': settings.utilityProviderId }
			: undefined,
	});

	const enhancePrompt = `
Enhance prompt below (wrapped in <prompt> tags) so that it can be better understood by LLMs You job is not to answer the prompt but simply prepare it to be answered by another LLM. 
You can do this by fixing spelling/grammatical errors, clarifying details, and removing unnecessary wording where possible.
Only return the enhanced prompt, nothing else. Do NOT wrap it in quotes, do NOT use markdown.
Do NOT respond to the prompt only optimize it so that another LLM can understand it better.
Do NOT remove context that may be necessary for the prompt to be understood.

${
	mentionedRules.length > 0
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
			model: utilityModel,
			messages: [{ role: 'user', content: enhancePrompt }],
			temperature: 0.5,
		}),
		(e) => `Enhance prompt API call failed: ${e}`
	);
	if (enhancedResult.isErr()) return error(500, 'error enhancing the prompt');

	const enhanced = enhancedResult.value.choices[0]?.message?.content;
	if (!enhanced) return error(500, 'error enhancing the prompt');

	return json({ ok: true, enhanced_prompt: enhanced } satisfies EnhancePromptResponse);
};
