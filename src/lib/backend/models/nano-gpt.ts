import { ResultAsync } from 'neverthrow';

export interface NanoGPTModel {
    id: string;
    name: string;
    created: number;
    description: string;
    // Keeping these compatible with OpenRouter interface if needed, but making them optional
    pricing?: {
        prompt: string;
        completion: string;
        image: string;
        request: string;
    };
    context_length?: number;
    architecture?: {
        input_modalities: string[];
        output_modalities: string[];
        tokenizer: string;
    };
}

export function getNanoGPTModels() {
    return ResultAsync.fromPromise(
        (async () => {
            const res = await fetch('https://nano-gpt.com/api/v1/models');

            if (!res.ok) {
                throw new Error(`Failed to fetch models: ${res.statusText}`);
            }

            const { data } = await res.json();

            if (!Array.isArray(data)) {
                return [];
            }

            return data.map((m: any) => ({
                id: m.id,
                name: m.id, // NanoGPT/OpenAI format usually doesn't have a separate name
                created: m.created || Date.now(),
                description: '', // No description in standard OpenAI format
                architecture: {
                    input_modalities: ['text'],
                    output_modalities: ['text'],
                    tokenizer: 'unknown',
                }, // Mocking for compatibility
            })) as NanoGPTModel[];
        })(),
        (e) => `[nano-gpt] Failed to fetch models: ${e}`
    );
}
