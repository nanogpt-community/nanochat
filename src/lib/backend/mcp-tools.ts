/**
 * MCP Tools Integration for Generate Message
 * 
 * Provides OpenAI-compatible tool definitions and handlers for MCP tools.
 * Used when mcpEnabled is true in user settings.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * MCP tool definitions in OpenAI-compatible format
 */
export const mcpToolDefinitions: ChatCompletionTool[] = [
    // Balance / Usage
    {
        type: 'function',
        function: {
            name: 'nanogpt_get_balance',
            description: 'Check the current account balance (USD and Nano). Use before expensive operations to verify sufficient funds.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    // Web Search
    {
        type: 'function',
        function: {
            name: 'nanogpt_web_search',
            description: 'Search the web for current information. Use this when you need up-to-date information, recent news, or to verify current facts.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to look up'
                    },
                    depth: {
                        type: 'string',
                        enum: ['standard', 'deep'],
                        description: 'Search depth - standard for quick results, deep for more comprehensive search'
                    }
                },
                required: ['query']
            }
        }
    },
    // URL Scraping
    {
        type: 'function',
        function: {
            name: 'nanogpt_scrape_urls',
            description: 'Scrape content from one or more web URLs. Use this when you need to read the full content of a specific webpage.',
            parameters: {
                type: 'object',
                properties: {
                    urls: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of URLs to scrape'
                    }
                },
                required: ['urls']
            }
        }
    },
    // YouTube Transcription
    {
        type: 'function',
        function: {
            name: 'nanogpt_youtube_transcribe',
            description: 'Get the transcript of a YouTube video. Use this when asked about YouTube video content.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'YouTube video URL'
                    }
                },
                required: ['url']
            }
        }
    },
    // Image Generation
    {
        type: 'function',
        function: {
            name: 'nanogpt_image_generate',
            description: 'Generate images from a text prompt using AI image models like DALL-E, Flux, or Midjourney.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: {
                        type: 'string',
                        description: 'The text prompt describing the image to generate'
                    },
                    model: {
                        type: 'string',
                        description: 'Optional model to use (e.g., dall-e-3, flux-pro, midjourney)'
                    },
                    size: {
                        type: 'string',
                        description: 'Image size (e.g., 1024x1024, 1792x1024)'
                    },
                    n: {
                        type: 'number',
                        description: 'Number of images to generate (1-10)'
                    }
                },
                required: ['prompt']
            }
        }
    },
    // List Text Models
    {
        type: 'function',
        function: {
            name: 'nanogpt_list_text_models',
            description: 'List available text/chat models with optional pricing details.',
            parameters: {
                type: 'object',
                properties: {
                    detailed: {
                        type: 'boolean',
                        description: 'Include detailed pricing information'
                    }
                },
                required: []
            }
        }
    },
    // List Image Models
    {
        type: 'function',
        function: {
            name: 'nanogpt_list_image_models',
            description: 'List available image generation models with optional pricing details.',
            parameters: {
                type: 'object',
                properties: {
                    detailed: {
                        type: 'boolean',
                        description: 'Include detailed pricing information'
                    }
                },
                required: []
            }
        }
    },
    // List Audio Models
    {
        type: 'function',
        function: {
            name: 'nanogpt_list_audio_models',
            description: 'List available audio models (TTS and STT) with optional pricing details.',
            parameters: {
                type: 'object',
                properties: {
                    detailed: {
                        type: 'boolean',
                        description: 'Include detailed pricing information'
                    },
                    type: {
                        type: 'string',
                        enum: ['tts', 'stt', 'all'],
                        description: 'Filter by audio model type'
                    }
                },
                required: []
            }
        }
    },
    // List Video Models
    {
        type: 'function',
        function: {
            name: 'nanogpt_list_video_models',
            description: 'List available video generation models with optional pricing details.',
            parameters: {
                type: 'object',
                properties: {
                    detailed: {
                        type: 'boolean',
                        description: 'Include detailed pricing information'
                    }
                },
                required: []
            }
        }
    },
    // Vision / Image Analysis
    {
        type: 'function',
        function: {
            name: 'nanogpt_vision',
            description: 'Analyze images with a vision-capable model. Use this to describe, analyze, or extract information from images.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: {
                        type: 'string',
                        description: 'The question or prompt about the image'
                    },
                    image_url: {
                        type: 'string',
                        description: 'URL of the image to analyze'
                    },
                    model: {
                        type: 'string',
                        description: 'Optional vision model to use (default: glm-4.6v)'
                    }
                },
                required: ['prompt', 'image_url']
            }
        }
    }
];

/**
 * Execute an MCP tool and return the result
 */
export async function executeMcpTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    try {
        switch (toolName) {
            case 'nanogpt_get_balance':
                return await executeGetBalance(apiKey);
            case 'nanogpt_web_search':
                return await executeWebSearch(toolArgs, apiKey);
            case 'nanogpt_scrape_urls':
                return await executeScrapeUrls(toolArgs, apiKey);
            case 'nanogpt_youtube_transcribe':
                return await executeYoutubeTranscribe(toolArgs, apiKey);
            case 'nanogpt_image_generate':
                return await executeImageGenerate(toolArgs, apiKey);
            case 'nanogpt_list_text_models':
                return await executeListModels('text', toolArgs, apiKey);
            case 'nanogpt_list_image_models':
                return await executeListModels('image', toolArgs, apiKey);
            case 'nanogpt_list_audio_models':
                return await executeListAudioModels(toolArgs, apiKey);
            case 'nanogpt_list_video_models':
                return await executeListModels('video', toolArgs, apiKey);
            case 'nanogpt_vision':
                return await executeVision(toolArgs, apiKey);
            default:
                return { success: false, result: '', error: `Unknown tool: ${toolName}` };
        }
    } catch (error) {
        return {
            success: false,
            result: '',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

async function executeGetBalance(
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const response = await fetch('https://nano-gpt.com/api/check-balance', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `Balance check failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();

    const usdBalance = parseFloat(data.usd_balance) || 0;
    const nanoBalance = parseFloat(data.nano_balance) || 0;

    return {
        success: true,
        result: `Current balance: $${usdBalance.toFixed(2)} USD, ${nanoBalance.toFixed(6)} XNO (Nano)`
    };
}

async function executeWebSearch(
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const query = args.query as string;
    const depth = (args.depth as string) || 'standard';

    const response = await fetch('https://nano-gpt.com/api/web', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, depth })
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `Web search failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();

    let resultText = `Web search results for "${query}":\n\n`;

    if (Array.isArray(data.data)) {
        for (const item of data.data.slice(0, 10)) {
            if (item.title) {
                resultText += `### ${item.title}\n`;
                if (item.url) resultText += `URL: ${item.url}\n`;
                if (item.content) resultText += `${item.content.slice(0, 500)}\n`;
                resultText += '\n';
            }
        }
    } else if (typeof data.data === 'object' && data.data !== null) {
        resultText += JSON.stringify(data.data, null, 2);
    }

    return { success: true, result: resultText };
}

async function executeScrapeUrls(
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const urls = args.urls as string[];

    const response = await fetch('https://nano-gpt.com/api/scrape-urls', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ urls })
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `URL scraping failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();

    let resultText = `Scraped content from ${urls.length} URL(s):\n\n`;

    if (Array.isArray(data.results)) {
        for (const result of data.results) {
            if (result.success) {
                resultText += `### ${result.title || result.url}\n`;
                resultText += `URL: ${result.url}\n`;
                if (result.content) {
                    resultText += `${result.content.slice(0, 3000)}\n`;
                    if (result.content.length > 3000) {
                        resultText += `... (content truncated, ${result.content.length} chars total)\n`;
                    }
                }
                resultText += '\n';
            } else {
                resultText += `### ${result.url} - FAILED\n`;
                resultText += `Error: ${result.error || 'Unknown error'}\n\n`;
            }
        }
    }

    return { success: true, result: resultText };
}

async function executeYoutubeTranscribe(
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const url = args.url as string;

    const response = await fetch('https://nano-gpt.com/api/youtube-transcribe', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `YouTube transcription failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();

    let resultText = `YouTube transcript for: ${url}\n\n`;

    if (data.transcript) {
        const transcript = data.transcript.slice(0, 8000);
        resultText += transcript;
        if (data.transcript.length > 8000) {
            resultText += `\n... (transcript truncated, ${data.transcript.length} chars total)`;
        }
    } else if (data.text) {
        const text = data.text.slice(0, 8000);
        resultText += text;
        if (data.text.length > 8000) {
            resultText += `\n... (transcript truncated, ${data.text.length} chars total)`;
        }
    }

    return { success: true, result: resultText };
}

async function executeImageGenerate(
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const prompt = args.prompt as string;
    const model = args.model as string | undefined;
    const size = args.size as string | undefined;
    const n = args.n as number | undefined;

    const requestBody: Record<string, unknown> = {
        prompt,
        response_format: 'url', // Always use URL for chat context
    };
    if (model) requestBody.model = model;
    if (size) requestBody.size = size;
    if (n) requestBody.n = n;

    const response = await fetch('https://nano-gpt.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `Image generation failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();

    let resultText = `Generated image(s) for prompt: "${prompt}"\n\n`;

    if (data.data && Array.isArray(data.data)) {
        for (let i = 0; i < data.data.length; i++) {
            const item = data.data[i];
            if (item.url) {
                resultText += `Image ${i + 1}: ${item.url}\n`;
            }
        }
    }

    return { success: true, result: resultText };
}

async function executeListModels(
    type: 'text' | 'image' | 'video',
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const detailed = args.detailed as boolean | undefined;

    const paths: Record<string, string> = {
        text: '/api/v1/models',
        image: '/api/v1/image-models',
        video: '/api/v1/video-models',
    };

    let url = `https://nano-gpt.com${paths[type]}`;
    if (detailed !== undefined) {
        url += `?detailed=${detailed}`;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `List ${type} models failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();
    const models = data.data || [];

    let resultText = `Available ${type} models (${models.length} total):\n\n`;

    for (const model of models.slice(0, 30)) {
        const name = model.id || model.name || model.model || JSON.stringify(model);
        resultText += `- ${name}`;
        if (detailed && model.pricing) {
            resultText += ` (Input: $${model.pricing.input}/1K, Output: $${model.pricing.output}/1K)`;
        }
        resultText += '\n';
    }

    if (models.length > 30) {
        resultText += `\n... and ${models.length - 30} more models`;
    }

    return { success: true, result: resultText };
}

async function executeListAudioModels(
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const detailed = args.detailed as boolean | undefined;
    const type = args.type as 'tts' | 'stt' | 'all' | undefined;

    let url = 'https://nano-gpt.com/api/v1/audio-models';
    const params = new URLSearchParams();
    if (detailed !== undefined) params.append('detailed', String(detailed));
    if (type) params.append('type', type);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `List audio models failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();
    const models = data.data || [];

    const typeLabel = type === 'tts' ? 'TTS' : type === 'stt' ? 'STT' : 'all audio';
    let resultText = `Available ${typeLabel} models (${models.length} total):\n\n`;

    for (const model of models.slice(0, 30)) {
        const name = model.id || model.name || model.model || JSON.stringify(model);
        resultText += `- ${name}\n`;
    }

    if (models.length > 30) {
        resultText += `\n... and ${models.length - 30} more models`;
    }

    return { success: true, result: resultText };
}

async function executeVision(
    args: Record<string, unknown>,
    apiKey: string
): Promise<{ success: boolean; result: string; error?: string }> {
    const prompt = args.prompt as string;
    const imageUrl = args.image_url as string;
    const model = (args.model as string) || 'zai-org/glm-4.6v';

    const requestBody = {
        model,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: imageUrl } }
                ]
            }
        ],
        stream: false,
    };

    const response = await fetch('https://nano-gpt.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { success: false, result: '', error: `Vision analysis failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        return { success: false, result: '', error: 'No response from vision model' };
    }

    return { success: true, result: `Image analysis result:\n\n${content}` };
}

/**
 * Check if MCP should be available for this request
 */
export function isMcpAvailable(
    mcpEnabled: boolean,
    usingServerKey: boolean,
    subscriptionOnlyMode: boolean
): boolean {
    // MCP is disabled if the toggle is off
    if (!mcpEnabled) return false;

    // MCP is disabled for server key users in subscription-only mode
    if (usingServerKey && subscriptionOnlyMode) return false;

    return true;
}
