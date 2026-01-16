// SSE (Server-Sent Events) helper utilities

/**
 * Types for SSE events sent during message streaming
 */
export type SSEEvent =
	| { event: 'message_start'; data: { conversation_id: string; message_id: string } }
	| { event: 'delta'; data: { content: string; reasoning: string } }
	| {
			event: 'message_complete';
			data: { token_count?: number; cost_usd?: number; response_time_ms?: number };
	  }
	| { event: 'error'; data: { error: string } };

/**
 * Format an SSE event for transmission
 * @param event The SSE event to format
 * @returns Formatted SSE string ready to be sent
 */
export function formatSSE(event: SSEEvent): string {
	return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Create SSE response headers
 * @returns Headers object configured for SSE
 */
export function sseHeaders(): Record<string, string> {
	return {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no', // Disable nginx buffering
	};
}

/**
 * Create an SSE encoder for use with ReadableStream
 * Handles encoding SSE events to Uint8Array
 */
export class SSEEncoder {
	private encoder = new TextEncoder();

	encode(event: SSEEvent): Uint8Array {
		return this.encoder.encode(formatSSE(event));
	}

	encodeComment(comment: string): Uint8Array {
		return this.encoder.encode(`: ${comment}\n\n`);
	}
}
