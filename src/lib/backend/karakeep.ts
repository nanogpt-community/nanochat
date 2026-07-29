import type { Conversation, Message } from '$lib/db/schema';

export interface KarakeepBookmark {
	type: 'text';
	text: string;
	title: string;
	sourceUrl?: string;
}

/**
 * Formats a conversation and its messages as markdown
 */
export function formatChatAsMarkdown(conversation: Conversation, messages: Message[]): string {
	const title = conversation.title || 'Untitled Conversation';
	const date = conversation.createdAt
		? new Date(conversation.createdAt).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			})
		: 'Unknown date';

	let markdown = `# ${title}\n\n`;
	markdown += `**Created:** ${date}\n\n`;

	if (conversation.updatedAt) {
		const updatedDate = new Date(conversation.updatedAt).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
		markdown += `**Last Updated:** ${updatedDate}\n\n`;
	}

	markdown += `---\n\n`;
	markdown += `## Messages\n\n`;

	for (const message of messages) {
		const role = message.role === 'user' ? 'User' : 'Assistant';
		markdown += `### ${role}\n\n`;
		markdown += `${message.content}\n\n`;

		if (message.reasoning) {
			markdown += `*Reasoning:* ${message.reasoning}\n\n`;
		}
	}

	return markdown;
}

/**
 * Tests connection to Karakeep instance
 */
export async function testKarakeepConnection(
	url: string,
	apiKey: string
): Promise<{ success: boolean; error?: string }> {
	try {
		// Normalize URL
		const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

		// Test connection by attempting to get user info
		const response = await fetch(`${baseUrl}/api/v1/users/me`, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Failed to connect: ${response.status} ${response.statusText}`,
			};
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Saves a chat conversation to Karakeep as a text bookmark
 */
export async function saveToKarakeep(
	conversation: Conversation,
	messages: Message[],
	karakeepUrl: string,
	apiKey: string,
	sourceUrl?: string
): Promise<{ success: boolean; bookmarkId?: string; error?: string }> {
	try {
		// Normalize URL
		const baseUrl = karakeepUrl.endsWith('/') ? karakeepUrl.slice(0, -1) : karakeepUrl;

		// Format the chat as markdown
		const markdown = formatChatAsMarkdown(conversation, messages);

		// Create bookmark payload
		const payload: KarakeepBookmark = {
			type: 'text',
			text: markdown,
			title: conversation.title || 'Chat Conversation',
			...(sourceUrl && { sourceUrl }),
		};

		// Send to Karakeep API
		const response = await fetch(`${baseUrl}/api/v1/bookmarks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			// The upstream body is deliberately NOT returned to the caller. karakeepUrl
			// is user-supplied and fetched server-side, so echoing the response back
			// turns this into a read primitive against whatever the server can reach —
			// internal services, cloud metadata — with the reply relayed to the user.
			// Pointing at a private address is legitimate for self-hosters, so the host
			// is not restricted here; what is removed is the ability to read the answer.
			const errorText = await response.text();
			console.error(
				`[Karakeep] Save failed: ${response.status} ${response.statusText}`,
				errorText.slice(0, 500)
			);
			return {
				success: false,
				error: `Failed to save to Karakeep (HTTP ${response.status}).`,
			};
		}

		const result = await response.json();
		return {
			success: true,
			bookmarkId: result.id,
		};
	} catch (error) {
		// Network-level errors can also disclose internal topology (DNS failures,
		// connection-refused for specific hosts/ports), so they are logged rather
		// than returned.
		console.error('[Karakeep] Save request failed:', error);
		return {
			success: false,
			error: 'Could not reach the configured Karakeep instance.',
		};
	}
}
