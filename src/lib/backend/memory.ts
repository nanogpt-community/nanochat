import OpenAI from 'openai';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { listUserMemories, applyMemoryOps, type MemoryOps } from '$lib/db/queries/user-memories';
import type { UserMemory } from '$lib/db/schema';

import { DEFAULT_BACKGROUND_MODEL } from '$lib/backend/default-models';
export const DEFAULT_MEMORY_MODEL = DEFAULT_BACKGROUND_MODEL;

/** System-prompt block injected into every chat when persistent memory is on. */
export function formatMemoriesForPrompt(memories: UserMemory[]): string {
	if (memories.length === 0) return '';
	return `[USER MEMORY]
Facts remembered about the user from earlier conversations. Use them when relevant; do not recite them unprompted or claim to remember things not listed here.
${memories.map((m) => `- ${m.content}`).join('\n')}

`;
}

const EXTRACTION_PROMPT = `You maintain a long-term memory of facts about a user for an AI assistant.
You are given the current memory list (with ids) and the latest exchange. Decide what to add, update, or delete.

Rules:
- Only store durable facts about the user: preferences, background, work, projects, goals, people in their life, how they like answers formatted. One concise third-person sentence each, e.g. "User is a backend developer working mainly in Go."
- Do not store transient task details, things the assistant said, or anything the user asked you not to remember.
- Prefer updating an existing memory over adding a near-duplicate. Delete memories the exchange contradicts or that the user asks to forget.
- Most exchanges contain nothing worth remembering. Then return empty arrays.

Respond with ONLY a JSON object of this shape, no prose:
{"add":["..."],"update":[{"id":"...","content":"..."}],"delete":["id"]}`;

export function parseMemoryOps(raw: string): MemoryOps | null {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	try {
		const obj = JSON.parse(raw.slice(start, end + 1));
		const strs = (v: unknown) =>
			Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
		const updates = Array.isArray(obj.update)
			? obj.update.filter(
					(u: unknown): u is { id: string; content: string } =>
						typeof u === 'object' &&
						u !== null &&
						typeof (u as { id?: unknown }).id === 'string' &&
						typeof (u as { content?: unknown }).content === 'string'
				)
			: [];
		return { add: strs(obj.add), update: updates, delete: strs(obj.delete) };
	} catch {
		return null;
	}
}

/**
 * Extract memories from one completed exchange and apply the resulting ops.
 * Meant to be fire-and-forget after a reply finishes; failures are logged only.
 */
export async function updateMemoriesFromExchange(opts: {
	userId: string;
	apiKey: string;
	modelId?: string | null;
	providerId?: string | null;
	userMessage: string;
	assistantMessage: string;
	log?: (msg: string) => void;
}): Promise<void> {
	const log = opts.log ?? (() => {});
	if (!opts.userMessage.trim() || !opts.assistantMessage.trim()) return;

	const existing = await listUserMemories(opts.userId);
	const openai = new OpenAI({
		baseURL: nanoGptUrl('/api/v1'),
		apiKey: opts.apiKey,
		defaultHeaders: opts.providerId ? { 'X-Provider': opts.providerId } : undefined,
	});

	// ponytail: exchange truncated to 6k chars a side; enough for extraction, keeps the call cheap
	const input = `Current memories:
${existing.length === 0 ? '(none)' : existing.map((m) => `${m.id}: ${m.content}`).join('\n')}

Latest exchange:
User: ${opts.userMessage.slice(0, 6000)}
Assistant: ${opts.assistantMessage.slice(0, 6000)}`;

	const res = await openai.chat.completions.create({
		model: opts.modelId || DEFAULT_MEMORY_MODEL,
		messages: [
			{ role: 'system', content: EXTRACTION_PROMPT },
			{ role: 'user', content: input },
		],
		temperature: 0,
		max_tokens: 1000,
	});

	const raw = res.choices[0]?.message?.content ?? '';
	const ops = parseMemoryOps(raw);
	if (!ops) {
		log(`Memory extraction returned unparseable output: ${raw.slice(0, 200)}`);
		return;
	}
	const validIds = new Set(existing.map((m) => m.id));
	ops.update = ops.update.filter((u) => validIds.has(u.id));
	ops.delete = ops.delete.filter((id) => validIds.has(id));
	if (ops.add.length + ops.update.length + ops.delete.length === 0) return;

	await applyMemoryOps(opts.userId, ops);
	log(`Memory updated: +${ops.add.length} ~${ops.update.length} -${ops.delete.length}`);
}
