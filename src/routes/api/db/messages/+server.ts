import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getConversationMessages,
	getPublicConversationMessages,
	createMessage,
	updateMessageContent,
	updateMessage,
	updateMessageError,
	deleteMessage,
	setMessageStarred,
} from '$lib/db/queries';
import { getConversationById } from '$lib/db/queries/conversations';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

function extractMarkdownImages(content: string): Array<{ url: string; fileName?: string }> {
	const images: Array<{ url: string; fileName?: string }> = [];
	const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	for (const match of content.matchAll(regex)) {
		const alt = match[1]?.trim();
		const rawUrl = match[2]?.trim();
		if (!rawUrl) continue;
		const url = rawUrl.split(/\s+/)[0]?.replace(/^<|>$/g, '');
		if (!url) continue;
		images.push({ url, fileName: alt || undefined });
	}
	return images;
}

function extractStorageId(url: string): string | null {
	const match = url.match(/\/api\/storage\/([a-zA-Z0-9_-]+)/);
	return match?.[1] ?? null;
}

function withInlineImages<
	T extends {
		id?: string;
		content: string;
		images?: Array<{ url: string; storage_id: string; fileName?: string }> | null;
	},
>(messages: T[]): T[] {
	return messages.map((message) => {
		if (message.images && message.images.length > 0) return message;
		if (!message.content) return message;

		const inlineImages = extractMarkdownImages(message.content);
		if (inlineImages.length === 0) return message;

		const images = inlineImages.map((image, index) => ({
			url: image.url,
			storage_id: extractStorageId(image.url) ?? `${message.id ?? 'inline'}-${index}`,
			fileName: image.fileName,
		}));

		return { ...message, images };
	});
}

// GET - get messages for a conversation
export const GET: RequestHandler = async ({ request, url }) => {
	const conversationId = url.searchParams.get('conversationId');
	const isPublic = url.searchParams.get('public') === 'true';

	if (!conversationId) {
		return error(400, 'Missing conversationId');
	}

	if (isPublic) {
		const messages = await getPublicConversationMessages(conversationId);
		if (!messages) {
			return error(404, 'Conversation not found or not public');
		}
		return json(withInlineImages(messages));
	}

	const userId = await getAuthenticatedUserId(request);
	const messages = await getConversationMessages(conversationId, userId);
	return json(withInlineImages(messages));
};

// POST - create or update message
export const POST: RequestHandler = async ({ request }) => {
	const userId = await getAuthenticatedUserId(request);
	const body = await request.json();
	const { action } = body;

	switch (action) {
		case 'create': {
			// Verify user owns the conversation
			const conversation = await getConversationById(body.conversationId, userId);
			if (!conversation || conversation.userId !== userId) {
				return error(403, 'Unauthorized');
			}

			const message = await createMessage(body.conversationId, {
				role: body.role,
				content: body.content,
				contentHtml: body.contentHtml,
				modelId: body.modelId,
				provider: body.provider,
				tokenCount: body.tokenCount,
				images: body.images,
				webSearchEnabled: body.webSearchEnabled,
				reasoningEffort: body.reasoningEffort,
			});
			return json(message);
		}

		case 'updateContent': {
			await updateMessageContent(body.messageId, {
				content: body.content,
				contentHtml: body.contentHtml,
				reasoning: body.reasoning,
				generationId: body.generationId,
				reasoningEffort: body.reasoningEffort,
				annotations: body.annotations,
			});
			return json({ ok: true });
		}

		case 'update': {
			await updateMessage(body.messageId, {
				tokenCount: body.tokenCount,
				costUsd: body.costUsd,
				generationId: body.generationId,
				contentHtml: body.contentHtml,
			});
			return json({ ok: true });
		}

		case 'updateError': {
			await updateMessageError(body.messageId, body.conversationId, body.error);
			return json({ ok: true });
		}

		case 'delete': {
			await deleteMessage(body.messageId);
			return json({ ok: true });
		}

		case 'setStarred': {
			await setMessageStarred(body.messageId, body.starred);
			return json({ ok: true });
		}

		default:
			return error(400, 'Invalid action');
	}
};
