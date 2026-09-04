import { db, generateId } from '$lib/db';
import {
	userEnabledModels,
	userKeys,
	userRules,
	userSettings,
	conversations,
	messages,
	user,
	type UserEnabledModel,
	type UserRule,
	type UserSettings,
} from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { Provider } from '$lib/types';
import { getNanoGPTModels, type NanoGPTModel } from '$lib/backend/models/nano-gpt';
import { getUserIdFromApiKey } from '$lib/backend/auth-utils';
import { nanoGptKeyFromRecord } from '$lib/backend/nanogpt-key.server';
import { isWebDisabledForServerKey } from '$lib/backend/message-limits';
import { assertSharedKeyUse } from '$lib/backend/shared-key-policy';
import { resolveConversationRefs } from '$lib/backend/conversation-refs';
import type { GenerateMessageRequestBody, Log } from './schema';

/** Bearer `nc_` API key first, then the session cookie. Throws a 401 otherwise. */
export async function authenticateGenerationRequest(request: Request, log: Log): Promise<string> {
	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer nc_')) {
		const result = await getUserIdFromApiKey(authHeader);
		if (result.isErr()) {
			log(`API key auth failed: ${result.error}`);
			throw error(401, result.error);
		}
		log('API key authentication successful');
		return result.value;
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		log('No valid authentication found');
		throw error(401, 'Authentication required: provide Bearer token or session cookie');
	}
	log('Cookie session authentication successful');
	return session.user.id;
}

export type GenerationContext = {
	userId: string;
	model: UserEnabledModel;
	modelInfo: NanoGPTModel | undefined;
	apiKey: string;
	usingServerKey: boolean;
	rules: UserRule[];
	userSettingsData: UserSettings | null;
	userName: string | undefined;
	webFeaturesDisabled: boolean;
	webSearchDepth: 'standard' | 'deep' | undefined;
	/** What to stamp on the stored user message. */
	userMessageWebSearch: boolean;
	isTemporary: boolean;
};

/**
 * Load the user's records, validate the model and key, and enforce limits.
 * Nothing is written except auto-enabling a valid model. Throws HTTP errors.
 */
export async function resolveGenerationContext({
	args,
	userId,
	log,
}: {
	args: GenerateMessageRequestBody;
	userId: string;
	log: Log;
}): Promise<GenerationContext> {
	const [modelRecord, keyRecord, rules, userSettingsData, userRecord, modelsResult] =
		await Promise.all([
			db.query.userEnabledModels.findFirst({
				where: and(
					eq(userEnabledModels.userId, userId),
					eq(userEnabledModels.provider, Provider.NanoGPT),
					eq(userEnabledModels.modelId, args.model_id)
				),
			}),
			db.query.userKeys.findFirst({
				where: and(eq(userKeys.userId, userId), eq(userKeys.provider, Provider.NanoGPT)),
			}),
			db.query.userRules.findMany({ where: eq(userRules.userId, userId) }),
			db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) }),
			db.query.user.findFirst({ where: eq(user.id, userId) }),
			getNanoGPTModels(),
		]);

	const modelInfo = modelsResult.isOk()
		? modelsResult.value.find((m) => m.id === args.model_id)
		: undefined;

	// Not enabled yet but a real catalog model: enable it on the fly.
	let model = modelRecord;
	if (!model && modelInfo) {
		log(`Model ${args.model_id} not enabled but valid, auto-enabling`);
		const now = new Date();
		model = {
			id: generateId(),
			userId,
			provider: Provider.NanoGPT,
			modelId: args.model_id,
			pinned: false,
			createdAt: now,
			updatedAt: now,
		};
		await db.insert(userEnabledModels).values(model);
	}
	if (!model) {
		log('Model not found or not enabled');
		throw error(400, 'Model not found or not enabled');
	}

	const key = nanoGptKeyFromRecord(keyRecord);
	if (!key) {
		log('No NanoGPT API key found');
		throw error(
			403,
			'No API key found. Please add your NanoGPT API key in Settings > Models to continue chatting.'
		);
	}
	const { apiKey, usingServerKey } = key;
	log(usingServerKey ? 'Using global API key' : 'Using user API key');

	// Model policy and daily quota for the operator's key, shared with every other
	// paid endpoint so none of them can be used to route around it.
	await assertSharedKeyUse({ userId, usingServerKey, modelId: args.model_id });

	const webFeaturesDisabled = usingServerKey && isWebDisabledForServerKey();
	if (webFeaturesDisabled) log('Web search disabled for server key user');
	const webSearchMode = webFeaturesDisabled ? 'off' : args.web_search_mode;
	const webSearchEnabled = webFeaturesDisabled ? false : args.web_search_enabled;

	return {
		userId,
		model,
		modelInfo,
		apiKey,
		usingServerKey,
		rules,
		userSettingsData: userSettingsData ?? null,
		userName: userRecord?.name ?? undefined,
		webFeaturesDisabled,
		webSearchDepth: webSearchMode && webSearchMode !== 'off' ? webSearchMode : undefined,
		userMessageWebSearch:
			webSearchMode && webSearchMode !== 'off' ? true : (webSearchEnabled ?? false),
		isTemporary: args.temporary === true,
	};
}

/** The same file listed twice would be parsed twice on every turn. */
function uniqueAttachments<T extends { storage_id: string }>(items: T[] | undefined): T[] | null {
	if (!items?.length) return null;
	const seen = new Set<string>();
	return items.filter((item) => !seen.has(item.storage_id) && seen.add(item.storage_id));
}

/** Create the conversation if needed, store the user message, and flag it generating. */
export async function persistUserTurn({
	args,
	ctx,
	log,
}: {
	args: GenerateMessageRequestBody;
	ctx: GenerationContext;
	log: Log;
}): Promise<string> {
	const { userId } = ctx;
	let conversationId = args.conversation_id;

	if (!conversationId) {
		if (args.message === undefined) {
			throw error(400, 'You must provide a message when creating a new conversation');
		}
		conversationId = generateId();
		const now = new Date();

		// Drops any project/assistant the caller may not use, rather than trusting the
		// request body with columns that prompt assembly later reads privileged data from.
		const refs = await resolveConversationRefs(userId, {
			projectId: args.project_id,
			assistantId: args.assistant_id,
		});

		await db.insert(conversations).values({
			id: conversationId,
			userId,
			title: 'New Chat',
			generating: true,
			public: false,
			pinned: false,
			costUsd: 0,
			assistantId: refs.assistantId,
			projectId: refs.projectId,
			temporary: ctx.isTemporary,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(messages).values({
			id: generateId(),
			conversationId,
			content: args.message,
			role: 'user',
			images: uniqueAttachments(args.images),
			documents: uniqueAttachments(args.documents),
			webSearchEnabled: ctx.userMessageWebSearch,
			createdAt: now,
		});
		log('New conversation and message created');
		return conversationId;
	}

	const existing = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
		columns: { assistantId: true },
	});
	if (!existing) throw error(403, 'Conversation not found or unauthorized');

	if (args.message) {
		await db.insert(messages).values({
			id: generateId(),
			conversationId,
			content: args.message,
			role: 'user',
			modelId: args.model_id,
			reasoningEffort: args.reasoning_effort,
			images: uniqueAttachments(args.images),
			documents: uniqueAttachments(args.documents),
			webSearchEnabled: ctx.userMessageWebSearch,
			createdAt: new Date(),
		});
		log('User message created');
	}

	const update: { generating: boolean; assistantId?: string | null } = { generating: true };
	if (args.assistant_id !== undefined && args.assistant_id !== existing.assistantId) {
		// Same ownership check as creation; an assistant the caller doesn't own is dropped.
		const refs = await resolveConversationRefs(userId, { assistantId: args.assistant_id || null });
		update.assistantId = refs.assistantId;
		log(`Updating conversation assistant to: ${refs.assistantId ?? 'none'}`);
	}
	await db.update(conversations).set(update).where(eq(conversations.id, conversationId));
	return conversationId;
}

export type PreparedGeneration = GenerationContext & { conversationId: string };

export async function prepareGeneration(opts: {
	args: GenerateMessageRequestBody;
	userId: string;
	log: Log;
}): Promise<PreparedGeneration> {
	const ctx = await resolveGenerationContext(opts);
	const conversationId = await persistUserTurn({ args: opts.args, ctx, log: opts.log });
	return { ...ctx, conversationId };
}
