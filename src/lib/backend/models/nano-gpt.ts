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
    subscription?: {
        included: boolean;
        note: string;
    };
}

export function getNanoGPTModels() {
    return ResultAsync.fromPromise(
        (async () => {
            const [textModelsRes, imageModelsRes, videoModelsRes] = await Promise.all([
                fetch('https://nano-gpt.com/api/v1/models?detailed=true'),
                fetch('https://nano-gpt.com/api/models/image'),
                fetch('https://nano-gpt.com/api/models/video')
            ]);

            if (!textModelsRes.ok) {
                throw new Error(`Failed to fetch text models: ${textModelsRes.statusText}`);
            }

            const { data: textData } = await textModelsRes.json();
            const textModels = Array.isArray(textData) ? textData.map((m: any) => ({
                id: m.id,
                name: m.name || m.id,
                created: m.created || Date.now(),
                description: m.description || '',
                context_length: m.context_length,
                architecture: {
                    input_modalities: m.capabilities?.vision ? ['text', 'image'] : ['text'],
                    output_modalities: ['text'],
                    tokenizer: 'unknown',
                },
                // Pricing from detailed=true: prompt/completion in USD per million tokens
                pricing: m.pricing ? {
                    prompt: String(m.pricing.prompt ?? 0),
                    completion: String(m.pricing.completion ?? 0),
                    image: '0',
                    request: '0'
                } : undefined,
                // Subscription info from API
                subscription: m.subscription ? {
                    included: m.subscription.included ?? false,
                    note: m.subscription.note ?? ''
                } : undefined,
            })) : [];


            let imageModels: NanoGPTModel[] = [];
            if (imageModelsRes.ok) {
                const imageData = await imageModelsRes.json();
                if (imageData.models && imageData.models.image) {
                    imageModels = Object.entries(imageData.models.image).map(([id, m]: [string, any]) => ({
                        id: id,
                        name: m.name || id,
                        created: m.dateAdded ? new Date(m.dateAdded).getTime() : Date.now(),
                        description: m.description || '',
                        architecture: {
                            input_modalities: ['text'],
                            output_modalities: ['image'],
                            tokenizer: 'unknown',
                        },
                        pricing: {
                            prompt: '0',
                            completion: '0',
                            image: JSON.stringify(m.cost) || '0',
                            request: '0'
                        },
                        // Subscription info from API
                        subscription: m.subscription ? {
                            included: m.subscription.included ?? false,
                            note: m.subscription.note ?? ''
                        } : undefined,
                    }));
                }
            }

            let videoModels: NanoGPTModel[] = [];
            if (videoModelsRes.ok) {
                const videoData = await videoModelsRes.json();
                if (videoData.models && videoData.models.video) {
                    videoModels = Object.entries(videoData.models.video).map(([id, m]: [string, any]) => ({
                        id: id,
                        name: m.name || id,
                        created: m.dateAdded ? new Date(m.dateAdded).getTime() : Date.now(),
                        description: m.description || '',
                        architecture: {
                            input_modalities: ['text', 'image'], // Video models often accept text and image
                            output_modalities: ['video'],
                            tokenizer: 'unknown',
                        },
                        pricing: {
                            prompt: '0',
                            completion: '0',
                            image: '0',
                            request: JSON.stringify(m.cost) || '0'
                        },
                        // Subscription info from API
                        subscription: m.subscription ? {
                            included: m.subscription.included ?? false,
                            note: m.subscription.note ?? ''
                        } : undefined,
                    }));
                }
            }

            return [...textModels, ...imageModels, ...videoModels] as NanoGPTModel[];
        })(),
        (e) => `[nano-gpt] Failed to fetch models: ${e}`
    );
}
