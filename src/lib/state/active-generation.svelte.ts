type GenerationMode = 'stream' | 'background';

class ActiveGenerationState {
	conversationId = $state<string | null>(null);
	mode = $state<GenerationMode | null>(null);

	start(conversationId: string, mode: GenerationMode) {
		this.conversationId = conversationId;
		this.mode = mode;
	}

	clear(conversationId?: string) {
		if (conversationId && this.conversationId !== conversationId) {
			return;
		}

		this.conversationId = null;
		this.mode = null;
	}

	isStreamingConversation(conversationId: string | undefined) {
		return this.mode === 'stream' && this.conversationId === conversationId;
	}
}

export const activeGeneration = new ActiveGenerationState();
