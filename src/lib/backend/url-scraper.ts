/**
 * URL Scraping module for extracting and scraping webpage content
 * Uses NanoGPT's Web Scraping API (https://nano-gpt.com/api/scrape-urls)
 */

const NANO_GPT_SCRAPE_URL = 'https://nano-gpt.com/api/scrape-urls';

// Regex to match HTTP/HTTPS URLs
const URL_REGEX = /https?:\/\/[^\s<>\[\]"'()]+/gi;

// Patterns to exclude from scraping
const EXCLUDED_PATTERNS = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/10\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i, // YouTube URLs should use transcription endpoint
];

export interface ScrapeUrlResult {
    url: string;
    success: boolean;
    title?: string;
    content?: string;
    markdown?: string;
    error?: string;
}

export interface ScrapeSummary {
    requested: number;
    processed: number;
    successful: number;
    failed: number;
    totalCost?: number;
    stealthModeUsed: boolean;
}

export interface ScrapeResponse {
    results: ScrapeUrlResult[];
    summary: ScrapeSummary;
}

/**
 * Extract valid URLs from a text string
 * Filters out localhost, private IPs, and YouTube URLs
 */
export function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX);
    if (!matches) return [];

    // Filter and deduplicate URLs
    const uniqueUrls = [...new Set(matches)];

    return uniqueUrls.filter((url) => {
        // Check against excluded patterns
        for (const pattern of EXCLUDED_PATTERNS) {
            if (pattern.test(url)) {
                return false;
            }
        }

        // Clean up trailing punctuation that might have been captured
        return true;
    }).map((url) => {
        // Remove trailing punctuation that's likely not part of the URL
        return url.replace(/[.,;:!?)\]]+$/, '');
    }).slice(0, 5); // API limit: max 5 URLs per request
}

/**
 * Scrape URLs using NanoGPT's Web Scraping API
 */
export async function scrapeUrls(
    urls: string[],
    apiKey: string,
    stealthMode: boolean = false
): Promise<ScrapeResponse | null> {
    if (urls.length === 0) return null;

    try {
        const response = await fetch(NANO_GPT_SCRAPE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify({
                urls,
                stealthMode,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[URL Scraper] API error: ${response.status} ${errorText}`);
            return null;
        }

        const data = await response.json() as ScrapeResponse;
        return data;
    } catch (error) {
        console.error(`[URL Scraper] Failed to scrape URLs: ${error}`);
        return null;
    }
}

/**
 * Format scraped results as context for the AI model
 */
export function formatScrapedContent(results: ScrapeUrlResult[]): string {
    const successfulResults = results.filter((r) => r.success && (r.markdown || r.content));

    if (successfulResults.length === 0) {
        return '';
    }

    const formattedPages = successfulResults.map((result, index) => {
        const content = result.markdown || result.content || '';
        // Truncate very long content to avoid context overflow
        const truncatedContent = content.length > 10000
            ? content.substring(0, 10000) + '\n\n[Content truncated...]'
            : content;

        return `[Page ${index + 1}] ${result.title || 'Untitled'}
URL: ${result.url}

${truncatedContent}`;
    }).join('\n\n---\n\n');

    return `Scraped Page Content:

${formattedPages}

Instructions: Use the above scraped page content to answer the user's query. Reference the content where relevant.

`;
}

/**
 * Extract URLs from a message, scrape them, and return formatted context
 * This is the main function to use in the message generation flow
 */
export async function scrapeUrlsFromMessage(
    messageContent: string,
    apiKey: string
): Promise<{ content: string; successCount: number }> {
    const urls = extractUrls(messageContent);

    if (urls.length === 0) {
        return { content: '', successCount: 0 };
    }

    console.log(`[URL Scraper] Found ${urls.length} URLs to scrape:`, urls);

    const response = await scrapeUrls(urls, apiKey);

    if (!response || !response.results) {
        return { content: '', successCount: 0 };
    }

    console.log(`[URL Scraper] Scraped ${response.summary.successful}/${response.summary.requested} URLs successfully`);

    return {
        content: formatScrapedContent(response.results),
        successCount: response.summary.successful
    };
}
