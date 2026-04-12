import { ResultAsync } from 'neverthrow';
import type { GenerateMessageRequestBody, GenerateMessageResponse } from './+server';
import type { Conversation, Message } from '$lib/api';
import {
	api,
	invalidateQueryPattern,
	setCachedQueryData,
	setCachedQueryDataMatching,
} from '$lib/cache/cached-query.svelte';
import { activeGeneration } from '$lib/state/active-generation.svelte';

export async function callGenerateMessage(args: GenerateMessageRequestBody) {
	const res = ResultAsync.fromPromise(
		(async () => {
			const res = await fetch('/api/generate-message', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(args),
			});

			if (!res.ok) {
				const { message } = await res.json();

				throw new Error(message as string);
			}

			return res.json() as Promise<GenerateMessageResponse>;
		})(),
		(e) => `${e}`
	);

	return res;
}

type StreamHandlers = {
	onConversationId?: (conversationId: string) => void;
	onComplete?: (conversationId: string) => void;
	onError?: (error: string) => void;
	signal?: AbortSignal;
	userId?: string;
};

type StreamEvent =
	| { event: 'message_start'; data: { conversation_id: string; message_id: string } }
	| { event: 'delta'; data: { content: string; reasoning: string } }
	| {
			event: 'message_complete';
			data: {
				token_count?: number;
				cost_usd?: number;
				response_time_ms?: number;
				time_to_first_token_ms?: number;
			};
	  }
	| { event: 'title_updated'; data: { conversation_id: string; title: string } }
	| {
			event: 'follow_ups_updated';
			data: { conversation_id: string; message_id: string; suggestions: string[] };
	  }
	| { event: 'error'; data: { error: string } };

function normalizeFollowUpSuggestions(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((suggestion): suggestion is string => typeof suggestion === 'string')
		: [];
}

const DEFAULT_MESSAGE_QUERY_LIMITS = [undefined, 20, 121] as const;

function createOptimisticId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createOptimisticConversation(
	conversationId: string,
	userId: string | undefined,
	args: GenerateMessageRequestBody
): Conversation {
	const now = new Date();

	return {
		id: conversationId,
		userId: userId ?? '',
		title: 'New Chat',
		updatedAt: now,
		pinned: false,
		generating: true,
		costUsd: 0,
		public: false,
		branchedFrom: null,
		assistantId: args.assistant_id ?? null,
		projectId: args.project_id ?? null,
		temporary: args.temporary ?? false,
		createdAt: now,
	};
}

function createOptimisticUserMessage(
	conversationId: string,
	args: GenerateMessageRequestBody,
	messageId: string
): Message {
	return {
		id: messageId,
		conversationId,
		role: 'user',
		content: args.message ?? '',
		contentHtml: null,
		reasoning: null,
		error: null,
		modelId: args.model_id,
		provider: args.provider_id ?? 'nanogpt',
		tokenCount: null,
		responseTimeMs: null,
		timeToFirstTokenMs: null,
		images: args.images ?? null,
		documents: args.documents ?? null,
		costUsd: null,
		generationId: null,
		webSearchEnabled: args.web_search_mode ? args.web_search_mode !== 'off' : false,
		reasoningEffort: args.reasoning_effort ?? null,
		annotations: null,
		followUpSuggestions: null,
		starred: false,
		createdAt: new Date(),
	};
}

function createOptimisticAssistantMessage(
	conversationId: string,
	args: GenerateMessageRequestBody,
	messageId: string
): Message {
	return {
		id: messageId,
		conversationId,
		role: 'assistant',
		content: '',
		contentHtml: null,
		reasoning: null,
		error: null,
		modelId: args.model_id,
		provider: args.provider_id ?? 'nanogpt',
		tokenCount: null,
		responseTimeMs: null,
		timeToFirstTokenMs: null,
		images: null,
		documents: null,
		costUsd: null,
		generationId: null,
		webSearchEnabled: args.web_search_mode ? args.web_search_mode !== 'off' : false,
		reasoningEffort: args.reasoning_effort ?? null,
		annotations: null,
		followUpSuggestions: null,
		starred: false,
		createdAt: new Date(),
	};
}

function upsertMessage(
	messages: Message[],
	message: Message,
	options: { replaceId?: string | null } = {}
): Message[] {
	const next = [...messages];
	const replaceIndex = options.replaceId
		? next.findIndex((item) => item.id === options.replaceId)
		: -1;

	if (replaceIndex !== -1) {
		next[replaceIndex] = {
			...next[replaceIndex],
			...message,
		};
		return next;
	}

	const existingIndex = next.findIndex((item) => item.id === message.id);
	if (existingIndex !== -1) {
		next[existingIndex] = {
			...next[existingIndex],
			...message,
		};
		return next;
	}

	next.push(message);
	return next;
}

function applyLimit(messages: Message[], args: Record<string, unknown> | undefined): Message[] {
	const limit = typeof args?.limit === 'number' ? args.limit : Number(args?.limit);
	if (!Number.isFinite(limit) || limit <= 0 || messages.length <= limit) {
		return messages;
	}

	return messages.slice(-limit);
}

function updateConversationMessageCaches(
	conversationId: string,
	updater: (current: Message[]) => Message[]
) {
	setCachedQueryDataMatching<Message[]>(
		(entry) =>
			entry.url === api.messages.getAllFromConversation.url &&
			entry.args?.conversationId === conversationId,
		(current, entry) => {
			const safeCurrent = Array.isArray(current) ? current : [];
			return applyLimit(updater(safeCurrent), entry.args);
		}
	);
}

function primeConversationMessageCaches(
	conversationId: string,
	messages: Message[]
) {
	for (const limit of DEFAULT_MESSAGE_QUERY_LIMITS) {
		const queryArgs = limit === undefined ? { conversationId } : { conversationId, limit };
		setCachedQueryData<Message[]>(
			api.messages.getAllFromConversation,
			queryArgs,
			(current = []) =>
				applyLimit(
					messages.reduce((acc, message) => upsertMessage(acc, message), current),
					queryArgs
				)
		);
	}
}

function patchAssistantMessage(
	conversationId: string,
	messageId: string,
	updater: (current: Message) => Message,
	options: { replaceId?: string | null; fallback?: Message } = {}
) {
	updateConversationMessageCaches(conversationId, (current = []) => {
			const seeded =
				options.fallback &&
				!current.some(
					(message) => message.id === messageId || message.id === options.replaceId
				)
					? upsertMessage(current, options.fallback, { replaceId: options.replaceId })
					: current;
			const index = seeded.findIndex(
				(message) => message.id === messageId || message.id === options.replaceId
			);
			if (index === -1) {
				return current;
			}

			const next = [...seeded];
			const existing = next[index];
			if (!existing) {
				return seeded;
			}
			next[index] = updater({
				...existing,
				id: messageId,
			});
			return next;
		});
}

function setConversationGenerating(conversationId: string, generating: boolean) {
	setCachedQueryData<Conversation>(
		api.conversations.getById,
		{ id: conversationId },
		(current) => {
			if (!current) {
				return current;
			}

			return {
				...current,
				generating,
				updatedAt: new Date(),
			};
		}
	);
}

function updateConversationCaches(
	conversationId: string,
	updater: (current: Conversation) => Conversation
) {
	setCachedQueryData<Conversation>(
		api.conversations.getById,
		{ id: conversationId },
		(current) => (current ? updater(current) : current)
	);

	setCachedQueryDataMatching<Conversation[]>(
		(entry) => entry.url === api.conversations.get.url,
		(current) => {
			const safeCurrent = Array.isArray(current) ? current : [];
			return safeCurrent.map((conversation) =>
				conversation.id === conversationId ? updater(conversation) : conversation
			);
		}
	);
}

function finalizeConversationRefresh(conversationId: string) {
	invalidateQueryPattern(api.conversations.get.url);
	invalidateQueryPattern(api.conversations.getById.url);
	invalidateQueryPattern(api.messages.getAllFromConversation.url);

	setTimeout(() => {
		invalidateQueryPattern(api.conversations.get.url);
	}, 1000);

	activeGeneration.clear(conversationId);
}

function parseSSEEvent(chunk: string): StreamEvent | null {
	const lines = chunk.split('\n');
	let eventName = '';
	const dataLines: string[] = [];

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith(':')) continue;
		if (line.startsWith('event:')) {
			eventName = line.slice(6).trim();
			continue;
		}
		if (line.startsWith('data:')) {
			dataLines.push(line.slice(5).trim());
		}
	}

	if (!eventName || dataLines.length === 0) {
		return null;
	}

	return {
		event: eventName,
		data: JSON.parse(dataLines.join('\n')),
	} as StreamEvent;
}

export async function callGenerateMessageStream(
	args: GenerateMessageRequestBody,
	handlers: StreamHandlers = {}
) {
	let conversationId = args.conversation_id ?? null;
	const optimisticUserMessageId = args.message ? createOptimisticId('optimistic-user') : null;

	if (conversationId) {
		const currentConversationId = conversationId;
		setConversationGenerating(currentConversationId, true);
		activeGeneration.start(currentConversationId, 'stream');

		if (optimisticUserMessageId && args.message) {
			const optimisticUser = createOptimisticUserMessage(
				currentConversationId,
				args,
				optimisticUserMessageId
			);
			primeConversationMessageCaches(currentConversationId, [optimisticUser]);
		}
	}

	const response = await fetch('/api/generate-message/stream', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(args),
		signal: handlers.signal,
	});

	if (!response.ok) {
		const contentType = response.headers.get('content-type') ?? '';
		if (conversationId) {
			activeGeneration.clear(conversationId);
		}

		if (contentType.includes('application/json')) {
			const { message } = await response.json();
			throw new Error(message as string);
		}

		throw new Error(await response.text());
	}

	if (!response.body) {
		if (conversationId) {
			activeGeneration.clear(conversationId);
		}
		throw new Error('Streaming response body missing');
	}

	void (async () => {
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let assistantMessageId: string | null = null;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const chunks = buffer.split('\n\n');
				buffer = chunks.pop() ?? '';

				for (const chunk of chunks) {
					const event = parseSSEEvent(chunk);
					if (!event) continue;

					if (event.event === 'message_start') {
						conversationId = event.data.conversation_id;
						assistantMessageId = event.data.message_id;
						const currentConversationId = conversationId;
						activeGeneration.start(currentConversationId, 'stream');

						const optimisticAssistant = createOptimisticAssistantMessage(
							currentConversationId,
							args,
							assistantMessageId
						);
						const optimisticMessages = [
							...(optimisticUserMessageId && args.message
								? [
										createOptimisticUserMessage(
											currentConversationId,
											args,
											optimisticUserMessageId
										),
									]
								: []),
							optimisticAssistant,
						];

						setCachedQueryData<Conversation>(
							api.conversations.getById,
							{ id: currentConversationId },
							(current) =>
								current
									? {
											...current,
											generating: true,
											updatedAt: new Date(),
										}
									: createOptimisticConversation(currentConversationId, handlers.userId, args)
						);

						primeConversationMessageCaches(currentConversationId, optimisticMessages);

						invalidateQueryPattern(api.conversations.get.url);
						handlers.onConversationId?.(currentConversationId);
						continue;
					}

					if (!conversationId) {
						continue;
					}

					if (event.event === 'delta' && assistantMessageId) {
						const optimisticAssistant = createOptimisticAssistantMessage(
							conversationId,
							args,
							assistantMessageId
						);
						patchAssistantMessage(conversationId, assistantMessageId, (current) => ({
							...current,
							content: current.content + event.data.content,
							reasoning: `${current.reasoning ?? ''}${event.data.reasoning}` || null,
							error: null,
						}), { fallback: optimisticAssistant });
						continue;
					}

					if (event.event === 'message_complete') {
						if (assistantMessageId) {
							const optimisticAssistant = createOptimisticAssistantMessage(
								conversationId,
								args,
								assistantMessageId
							);
							patchAssistantMessage(conversationId, assistantMessageId, (current) => ({
								...current,
								tokenCount: event.data.token_count ?? current.tokenCount,
								costUsd: event.data.cost_usd ?? current.costUsd,
								responseTimeMs: event.data.response_time_ms ?? current.responseTimeMs,
								timeToFirstTokenMs:
									event.data.time_to_first_token_ms ?? current.timeToFirstTokenMs,
							}), { fallback: optimisticAssistant });
						}

						setConversationGenerating(conversationId, false);
						finalizeConversationRefresh(conversationId);
						handlers.onComplete?.(conversationId);
						continue;
					}

					if (event.event === 'title_updated') {
						updateConversationCaches(event.data.conversation_id, (current) => ({
							...current,
							title: event.data.title,
							updatedAt: new Date(),
						}));
						continue;
					}

					if (event.event === 'follow_ups_updated') {
						const suggestions = normalizeFollowUpSuggestions(event.data.suggestions);
						if (suggestions.length === 0) {
							continue;
						}

						patchAssistantMessage(
							event.data.conversation_id,
							event.data.message_id,
							(current) => ({
								...current,
								followUpSuggestions: suggestions,
							}),
							{
								fallback: createOptimisticAssistantMessage(
									event.data.conversation_id,
									args,
									event.data.message_id
								),
							}
						);
						continue;
					}

					if (event.event === 'error') {
						if (assistantMessageId) {
							const optimisticAssistant = createOptimisticAssistantMessage(
								conversationId,
								args,
								assistantMessageId
							);
							patchAssistantMessage(conversationId, assistantMessageId, (current) => ({
								...current,
								error: event.data.error,
							}), { fallback: optimisticAssistant });
						}

						setConversationGenerating(conversationId, false);
						finalizeConversationRefresh(conversationId);
						handlers.onError?.(event.data.error);
					}
				}
			}
		} catch (error) {
			if (handlers.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
				return;
			}

			const message = error instanceof Error ? error.message : String(error);
			if (conversationId) {
				setConversationGenerating(conversationId, false);
				finalizeConversationRefresh(conversationId);
			}
			handlers.onError?.(message);
		} finally {
			reader.releaseLock();
		}
	})();
}
