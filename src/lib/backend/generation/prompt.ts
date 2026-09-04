import type OpenAI from 'openai';
import { db, generateId } from '$lib/db';
import {
	messages,
	storage,
	conversations,
	assistants,
	projects,
	type UserRule,
	type UserSettings,
} from '$lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { Provider } from '$lib/types';
import * as array from '$lib/utils/array';
import { parseMessageForRules } from '$lib/utils/rules.js';
import { extractStoredDocumentText } from '$lib/backend/document-text';
import { substituteSystemPromptVariables } from '$lib/utils/system-prompt-variables';
import { listUserMemories } from '$lib/db/queries/user-memories';
import { formatMemoriesForPrompt } from '$lib/backend/memory';
import { canAccessProject } from '$lib/backend/conversation-refs';
import { compactIfNeeded, estimateTokens, formatSummaryForPrompt } from '$lib/backend/compaction';
import {
	extractUrlsByType,
	scrapeUrls,
	formatScrapedContent,
} from '$lib/backend/url-scraper.server';
import type { Log } from './schema';

const SCRAPE_COST_PER_URL = 0.001;

export type ConversationMessageRow = {
	id: string;
	role: string;
	content: string;
	images: Array<{ url: string; storage_id: string; fileName?: string }> | null;
	documents: Array<{
		url: string;
		storage_id: string;
		fileName?: string;
		fileType: 'pdf' | 'markdown' | 'text' | 'epub';
	}> | null;
	webSearchEnabled: boolean | null;
	promptTokens: number | null;
};

export type ImagePart = { type: 'image_url'; image_url: { url: string } };
export type TextPart = { type: 'text'; text: string };
export type FormattedMessage =
	| { role: 'user' | 'assistant' | 'system'; content: string }
	| { role: 'user'; content: Array<TextPart | ImagePart> };

export async function loadConversationMessages(conversationId: string): Promise<{
	conversationMessages: ConversationMessageRow[];
	lastUserMessage: ConversationMessageRow | undefined;
}> {
	// Only the columns prompt construction consumes; full rows would drag
	// contentHtml, reasoning and annotations for the whole thread on every send.
	const conversationMessages = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		columns: {
			id: true,
			role: true,
			content: true,
			images: true,
			documents: true,
			webSearchEnabled: true,
			promptTokens: true,
		},
		orderBy: [asc(messages.createdAt)],
	});
	return {
		conversationMessages,
		lastUserMessage: conversationMessages.filter((m) => m.role === 'user').pop(),
	};
}

export async function createAssistantMessage(opts: {
	conversationId: string;
	modelId: string;
	webSearchEnabled: boolean;
}): Promise<string> {
	const id = generateId();
	await db.insert(messages).values({
		id,
		conversationId: opts.conversationId,
		modelId: opts.modelId,
		provider: Provider.NanoGPT,
		content: '',
		role: 'assistant',
		webSearchEnabled: opts.webSearchEnabled,
		createdAt: new Date(),
	});
	return id;
}

async function readStorageBuffer(path: string): Promise<Buffer> {
	return Buffer.from(await readFile(path));
}

async function formatImages(
	userId: string,
	images: NonNullable<ConversationMessageRow['images']>
): Promise<ImagePart[]> {
	return Promise.all(
		images.map(async (img): Promise<ImagePart> => {
			const passthrough = { type: 'image_url' as const, image_url: { url: img.url } };
			if (img.url.startsWith('data:') || img.url.startsWith('http')) return passthrough;

			const record = await db.query.storage.findFirst({
				where: and(eq(storage.id, img.storage_id), eq(storage.userId, userId)),
			});
			if (!record) {
				console.warn(`Storage record not found for id: ${img.storage_id}`);
				return passthrough;
			}
			try {
				const base64 = (await readStorageBuffer(record.path)).toString('base64');
				return {
					type: 'image_url',
					image_url: { url: `data:${record.mimeType};base64,${base64}` },
				};
			} catch (e) {
				console.error(`Failed to read file for image ${img.storage_id}:`, e);
				return passthrough;
			}
		})
	);
}

async function formatDocuments(
	userId: string,
	documents: NonNullable<ConversationMessageRow['documents']>
): Promise<TextPart[]> {
	return Promise.all(
		documents.map(async (doc): Promise<TextPart> => {
			const label = doc.fileName || 'Untitled';
			const fallback = {
				type: 'text' as const,
				text: `[Document: ${doc.fileName || doc.fileType}] ${doc.url}`,
			};
			if (doc.url.startsWith('data:') || doc.url.startsWith('http')) return fallback;

			const record = await db.query.storage.findFirst({
				where: and(eq(storage.id, doc.storage_id), eq(storage.userId, userId)),
			});
			if (!record) {
				console.warn(`Storage record not found for document id: ${doc.storage_id}`);
				return fallback;
			}

			const unextractable = (kind: string) => ({
				type: 'text' as const,
				text: `[${kind} Document: ${label}] File ID: ${doc.storage_id}\n\n[Note: ${kind} content could not be extracted automatically. The ${kind} is stored and available for download.]`,
			});

			try {
				if (doc.fileType === 'text' || doc.fileType === 'markdown') {
					const content = (await readStorageBuffer(record.path)).toString('utf-8');
					return {
						type: 'text',
						text: `[${doc.fileType.toUpperCase()} Document: ${label}]\n\n${content}`,
					};
				}
				if (doc.fileType === 'epub') {
					try {
						return {
							type: 'text',
							text: `[EPUB Document: ${label}]\n\n${await extractStoredDocumentText(doc.storage_id, record.path, 'epub')}`,
						};
					} catch (e) {
						console.error('Failed to extract EPUB text:', e);
						return unextractable('EPUB');
					}
				}
				try {
					return {
						type: 'text',
						text: `[PDF Document: ${label}]\n\n${await extractStoredDocumentText(doc.storage_id, record.path, 'pdf')}`,
					};
				} catch (e) {
					console.error('Failed to extract PDF text:', e);
					return unextractable('PDF');
				}
			} catch (e) {
				console.error(`Failed to read document ${doc.storage_id}:`, e);
				return fallback;
			}
		})
	);
}

export async function formatMessages(
	userId: string,
	rows: ConversationMessageRow[]
): Promise<FormattedMessage[]> {
	return Promise.all(
		rows.map(async (m): Promise<FormattedMessage> => {
			const hasImages = m.role === 'user' && !!m.images?.length;
			const hasDocs = m.role === 'user' && !!m.documents?.length;
			if (!hasImages && !hasDocs) {
				return { role: m.role as 'user' | 'assistant' | 'system', content: m.content };
			}
			const [images, docs] = await Promise.all([
				hasImages ? formatImages(userId, m.images!) : [],
				hasDocs ? formatDocuments(userId, m.documents!) : [],
			]);
			return { role: 'user', content: [{ type: 'text', text: m.content }, ...images, ...docs] };
		})
	);
}

export function attachedRulesFor(
	rules: UserRule[],
	conversationMessages: ConversationMessageRow[]
): UserRule[] {
	const manual = rules.filter((r) => r.attach === 'manual');
	const attached = rules.filter((r) => r.attach === 'always');
	for (const message of conversationMessages) {
		attached.push(...parseMessageForRules(message.content, manual));
	}
	return array.fromMap(
		array.toMap(attached, (r) => [r.id, r]),
		(_k, v) => v
	);
}

export type BuiltPrompt = {
	formattedMessages: FormattedMessage[];
	messagesToSend: FormattedMessage[];
	scrapeCost: number;
};

/**
 * Turn the stored conversation into the request payload: memory, scraped URLs,
 * assistant/project instructions, rules, attachments, and compaction.
 */
export async function buildPrompt(opts: {
	conversationId: string;
	userId: string;
	conversationMessages: ConversationMessageRow[];
	lastUserMessage: ConversationMessageRow | undefined;
	model: { modelId: string; provider: string };
	apiKey: string;
	providerId?: string;
	rules: UserRule[];
	userSettingsData: UserSettings | null;
	webFeaturesDisabled: boolean;
	userName?: string;
	openai: OpenAI;
	log: Log;
}): Promise<BuiltPrompt> {
	const { conversationMessages, lastUserMessage, userSettingsData, log } = opts;

	let memoryBlock = '';
	if (userSettingsData?.persistentMemoryEnabled) {
		try {
			memoryBlock = formatMemoriesForPrompt(await listUserMemories(opts.userId));
			log(`Persistent memory loaded (${memoryBlock.length} chars)`);
		} catch (e) {
			log(`Failed to fetch persistent memory: ${e}`);
		}
	}

	let scrapedContent = '';
	let scrapeCost = 0;
	if (lastUserMessage && !opts.webFeaturesDisabled && userSettingsData?.webScrapingEnabled) {
		try {
			const { regularUrls } = extractUrlsByType(lastUserMessage.content);
			if (regularUrls.length > 0) {
				log(`Processing ${regularUrls.length} URLs`);
				const result = await scrapeUrls(regularUrls, opts.apiKey);
				if (result) {
					scrapedContent = formatScrapedContent(result.results);
					scrapeCost = result.summary.successful * SCRAPE_COST_PER_URL;
				}
			}
		} catch (e) {
			log(`URL processing failed: ${e}`);
		}
	}

	const attachedRules = attachedRulesFor(opts.rules, conversationMessages);
	log(`${attachedRules.length} rules attached`);

	const [formattedMessages, conversation] = await Promise.all([
		formatMessages(opts.userId, conversationMessages),
		db.query.conversations.findFirst({ where: eq(conversations.id, opts.conversationId) }),
	]);

	// The assistant and the project both hang off the conversation, so they load
	// together. Columns are narrowed: the project otherwise returns every file's
	// full extractedContent plus columns nothing below reads.
	// The stored ids are re-authorized here, not trusted: a project the user was
	// removed from, or an assistant they never owned, must not leak its prompt or
	// files into the model context just because the conversation row still points
	// at it.
	const [assistant, project] = await Promise.all([
		conversation?.assistantId
			? db.query.assistants.findFirst({
					where: and(eq(assistants.id, conversation.assistantId), eq(assistants.userId, opts.userId)),
					columns: { systemPrompt: true },
				})
			: undefined,
		conversation?.projectId
			? canAccessProject(opts.userId, conversation.projectId).then((allowed) => {
					if (!allowed) {
						log('Project context skipped: user no longer has access');
						return undefined;
					}
					return db.query.projects.findFirst({
						where: eq(projects.id, conversation.projectId!),
						columns: { systemPrompt: true },
						with: { files: { columns: { fileName: true, extractedContent: true } } },
					});
				})
			: undefined,
	]);

	const substitute = (prompt: string) =>
		substituteSystemPromptVariables(prompt, {
			modelId: opts.model.modelId,
			modelName: opts.model.modelId,
			provider: opts.model.provider,
			userName: opts.userName,
			timezone: userSettingsData?.timezone,
		});

	let systemContent = memoryBlock;
	if (assistant?.systemPrompt) systemContent += `${substitute(assistant.systemPrompt)}\n\n`;
	if (project?.systemPrompt) {
		systemContent += `\n[PROJECT INSTRUCTIONS]\n${substitute(project.systemPrompt)}\n\n`;
	}
	if (project?.files?.length) {
		const knowledge = project.files
			.filter((f) => f.extractedContent)
			.map(
				(f) =>
					`\n--- START OF FILE: ${f.fileName} ---\n${f.extractedContent}\n--- END OF FILE: ${f.fileName} ---\n`
			)
			.join('');
		if (knowledge) {
			systemContent += `\n[PROJECT KNOWLEDGE BASE]\nThe following files are attached to this project. Use them as context to answer user queries.\n${knowledge}\n\n`;
		}
	}
	systemContent += scrapedContent;
	if (attachedRules.length > 0) {
		systemContent += `The user has mentioned one or more rules to follow with the @<rule_name> syntax. Please follow these rules as they apply.
Rules to follow:
${attachedRules.map((r) => `- ${r.name}: ${r.rule}`).join('\n')}`;
	}

	// The provider's reported prompt size for the last reply beats the chars/4
	// heuristic for everything up to that message.
	const lastMeasuredIndex = conversationMessages.findLastIndex(
		(m) => m.role === 'assistant' && m.promptTokens != null
	);
	const knownPromptTokens =
		lastMeasuredIndex >= 0
			? {
					messageIndex: lastMeasuredIndex,
					tokens: conversationMessages[lastMeasuredIndex]!.promptTokens!,
				}
			: undefined;

	const compaction = await compactIfNeeded({
		conversation: conversation ?? {
			id: opts.conversationId,
			compactionSummary: null,
			compactedThroughMessageId: null,
		},
		messageIds: conversationMessages.map((m) => m.id),
		messages: formattedMessages,
		systemTokens: estimateTokens(systemContent),
		knownPromptTokens,
		enabled: userSettingsData?.autoCompactEnabled ?? true,
		thresholdPercent: userSettingsData?.autoCompactThreshold ?? 80,
		modelId: opts.model.modelId,
		providerId: opts.providerId,
		apiKey: opts.apiKey,
		openai: opts.openai,
		log,
	});
	const liveMessages = formattedMessages.slice(compaction.startIndex);
	if (compaction.summary)
		systemContent = formatSummaryForPrompt(compaction.summary) + systemContent;

	const messagesToSend: FormattedMessage[] = systemContent
		? [{ role: 'system', content: systemContent }, ...liveMessages]
		: liveMessages;

	return { formattedMessages, messagesToSend, scrapeCost };
}
