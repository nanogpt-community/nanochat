import { ResultAsync } from 'neverthrow';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedModels: NanoGPTModel[] | null = null;
let cachedAt = 0;
let inFlight: Promise<NanoGPTModel[]> | null = null;

function isCacheFresh(now: number) {
	return cachedModels !== null && now - cachedAt < MODEL_CACHE_TTL_MS;
}

async function fetchNanoGPTModels(): Promise<NanoGPTModel[]> {
	const [textModelsRes, imageModelsRes, videoModelsRes] = await Promise.all([
		fetch(nanoGptUrl('/api/v1/models?detailed=true')),
		fetch(nanoGptUrl('/api/models/image')),
		fetch(nanoGptUrl('/api/models/video')),
	]);

	if (!textModelsRes.ok) {
		throw new Error(`Failed to fetch text models: ${textModelsRes.statusText}`);
	}

	const { data: textData } = await textModelsRes.json();
	const textModels = Array.isArray(textData)
		? textData.map((m: any) => ({
				id: m.id,
				name: m.name || m.id,
				created: m.created || Date.now(),
				description: m.description || '',
				icon_url: m.icon_url,
				owned_by: m.owned_by,
				max_output_tokens: m.max_output_tokens,
				cost_estimate: m.cost_estimate,
				capabilities: m.capabilities
					? {
							vision: m.capabilities.vision ?? false,
							reasoning: m.capabilities.reasoning ?? false,
						}
					: undefined,
				context_length: m.context_length,
				architecture: {
					input_modalities: m.capabilities?.vision ? ['text', 'image'] : ['text'],
					output_modalities: ['text'],
					tokenizer: 'unknown',
				},
				// Pricing from detailed=true: prompt/completion in USD per million tokens
				pricing: m.pricing
					? {
							prompt: String(m.pricing.prompt ?? 0),
							completion: String(m.pricing.completion ?? 0),
							image: '0',
							request: '0',
						}
					: undefined,
				// Subscription info from API
				subscription: m.subscription
					? {
							included: m.subscription.included ?? false,
							note: m.subscription.note ?? '',
						}
					: undefined,
			}))
		: [];

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
					request: '0',
				},
				// Subscription info from API
				subscription: m.subscription
					? {
							included: m.subscription.included ?? false,
							note: m.subscription.note ?? '',
						}
					: undefined,
				additionalParams: m.additionalParams,
				defaultSettings: m.defaultSettings,
				resolutions: m.resolutions,
				maxImages: m.maxImages,
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
					request: JSON.stringify(m.cost) || '0',
				},
				// Subscription info from API
				subscription: m.subscription
					? {
							included: m.subscription.included ?? false,
							note: m.subscription.note ?? '',
						}
					: undefined,
				additionalParams: m.additionalParams,
				defaultSettings: m.defaultSettings,
			}));
		}
	}

	return [...textModels, ...imageModels, ...videoModels] as NanoGPTModel[];
}

export interface NanoGPTModel {
    id: string;
    name: string;
    created: number;
    description: string;
    icon_url?: string;
    owned_by?: string;
    max_output_tokens?: number;
    cost_estimate?: number;
    capabilities?: {
        vision?: boolean;
        reasoning?: boolean;
    };
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
    additionalParams?: Record<string, {
        label: string;
        description: string;
        type: 'select' | 'boolean' | 'switch' | 'text' | 'number';
        default: any;
        options?: { value: string; label: string }[];
    }>;
    defaultSettings?: Record<string, any>;
    resolutions?: { value: string; comment: string }[];
    maxImages?: number;
}

export function getNanoGPTModels() {
	return ResultAsync.fromPromise(
		(async () => {
			const now = Date.now();
			if (isCacheFresh(now)) {
				return cachedModels as NanoGPTModel[];
			}

			if (inFlight) {
				return inFlight;
			}

			inFlight = (async () => {
				try {
					const models = await fetchNanoGPTModels();
					cachedModels = models;
					cachedAt = Date.now();
					return models;
				} catch (error) {
					if (cachedModels) {
						console.warn('[nano-gpt] Failed to refresh models; using cached data.', error);
						return cachedModels;
					}
					throw error;
				} finally {
					inFlight = null;
				}
			})();

			return inFlight;
		})(),
		(e) => `[nano-gpt] Failed to fetch models: ${e}`
	);
}
