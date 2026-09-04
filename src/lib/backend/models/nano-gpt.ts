import { ResultAsync } from 'neverthrow';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedModels: NanoGPTModel[] | null = null;
let cachedAt = 0;
let inFlight: Promise<NanoGPTModel[]> | null = null;

function isCacheFresh(now: number) {
	return cachedModels !== null && now - cachedAt < MODEL_CACHE_TTL_MS;
}

const NANO_GPT_SITE = 'https://nano-gpt.com';

function absoluteMediaUrl(src: unknown): string | undefined {
	if (typeof src !== 'string' || !src) return undefined;
	return src.startsWith('/') ? `${NANO_GPT_SITE}${src}` : src;
}

/** First still image usable as a thumbnail: an image example, or a video example's poster. */
function exampleThumbnail(examples: unknown): string | undefined {
	if (!Array.isArray(examples)) return undefined;
	for (const e of examples as Array<Record<string, unknown>>) {
		if (!e || typeof e !== 'object') continue;
		if (e.type === 'image' && typeof e.src === 'string') return absoluteMediaUrl(e.src);
		if (typeof e.thumbnail === 'string') return absoluteMediaUrl(e.thumbnail);
	}
	return undefined;
}

function examplePrompt(examples: unknown): string | undefined {
	if (!Array.isArray(examples)) return undefined;
	const e = (examples as Array<Record<string, unknown>>).find((x) => typeof x?.prompt === 'string');
	return e ? (e.prompt as string) : undefined;
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
				// Studio picker metadata
				vendor: m.provider,
				mode: m.iconLabel,
				tags: Array.isArray(m.tags) ? m.tags : undefined,
				label: m.label,
				dateAdded: m.dateAdded,
				supportsImageInput:
					m.iconLabel === 'image-to-image' ||
					m.iconLabel === 'both' ||
					!!m.inputImageConstraints ||
					!!m.supportsMultipleImg2Img,
				exampleImage: exampleThumbnail(m.examples),
				examplePrompt: examplePrompt(m.examples),
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
				// Studio picker metadata
				vendor: m.provider,
				mode: m.supportsImageToVideo || m.requiresImage ? 'both' : 'text-to-image',
				tags: Array.isArray(m.tags) ? m.tags : undefined,
				label: m.label,
				dateAdded: m.dateAdded,
				supportsImageInput: !!m.supportsImageToVideo || !!m.requiresImage,
				requiresImage: !!m.requiresImage,
				exampleImage: exampleThumbnail(m.examples),
				examplePrompt: examplePrompt(m.examples),
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
	additionalParams?: Record<
		string,
		{
			label: string;
			description: string;
			type: 'select' | 'boolean' | 'switch' | 'text' | 'number';
			default: any;
			options?: { value: string; label: string }[];
		}
	>;
	defaultSettings?: Record<string, any>;
	resolutions?: { value: string; comment: string }[];
	maxImages?: number;
	// Image models only
	vendor?: string;
	mode?: 'text-to-image' | 'image-to-image' | 'both';
	tags?: string[];
	label?: string;
	dateAdded?: string;
	supportsImageInput?: boolean;
	/** Video models that only animate a supplied image. */
	requiresImage?: boolean;
	exampleImage?: string;
	examplePrompt?: string;
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
