
import { ResultAsync, err, ok } from 'neverthrow';

const NANO_GPT_WEB_URL = 'https://nano-gpt.com/api/web';

export interface WebSearchResult {
    type: 'text' | 'image';
    title: string;
    url: string;
    content?: string;
    imageUrl?: string;
    snippet?: string;
}

export interface WebSearchResponse {
    data: WebSearchResult[];
    metadata: {
        query: string;
        depth: string;
        outputType: string;
        timestamp: string;
        cost: number;
    };
}

export async function performNanoGPTWebSearch(
    query: string,
    apiKey: string
): Promise<string> {
    try {
        const response = await fetch(NANO_GPT_WEB_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify({
                query: query,
                outputType: 'searchResults',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return `Error performing web search: ${response.status} ${errorText}`;
        }

        const json = (await response.json()) as WebSearchResponse;

        if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
            return "No search results found.";
        }

        // Format results for the LLM
        const formattedResults = json.data
            .filter((item) => item.type === 'text') // Focus on text results for now
            .map((item, index) => {
                return `[${index + 1}] ${item.title}\nURL: ${item.url}\nContent: ${item.content || item.snippet || ''}`;
            })
            .join('\n\n');

        return `Search Results for "${query}":\n\n${formattedResults}`;
    } catch (error) {
        return `Failed to perform web search: ${error}`;
    }
}
