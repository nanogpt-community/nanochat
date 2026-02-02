/**
 * URL scraping helpers shared by client and server.
 */

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
 * Extract YouTube video ID from various YouTube URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
	const patterns = [
		/youtube\.com\/watch\?v=([^&]+)/,
		/youtu\.be\/([^?]+)/,
		/youtube\.com\/embed\/([^?]+)/,
		/youtube\.com\/v\/([^?]+)/,
		/youtube\.com\/live\/([^?]+)/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) return match[1];
	}
	return null;
}

/**
 * Separate YouTube URLs from regular URLs
 */
export function extractUrlsByType(text: string): {
	regularUrls: string[];
	youtubeUrls: string[];
} {
	const matches = text.match(URL_REGEX);
	if (!matches) return { regularUrls: [], youtubeUrls: [] };

	const uniqueUrls = [...new Set(matches)];
	const regularUrls: string[] = [];
	const youtubeUrls: string[] = [];

	for (const url of uniqueUrls) {
		const cleanUrl = url.replace(/[.,;:!?)\]]+$/, '');

		if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i.test(cleanUrl)) {
			youtubeUrls.push(cleanUrl);
		} else if (!EXCLUDED_PATTERNS.some((pattern) => pattern.test(cleanUrl))) {
			regularUrls.push(cleanUrl);
		}
	}

	return {
		regularUrls: regularUrls.slice(0, 5),
		youtubeUrls: youtubeUrls.slice(0, 5), // Also limit YouTube URLs
	};
}

/**
 * Extract valid URLs from a text string
 * Filters out localhost, private IPs, and YouTube URLs
 * @deprecated Use extractUrlsByType instead
 */
export function extractUrls(text: string): string[] {
	const { regularUrls } = extractUrlsByType(text);
	return regularUrls;
}

/**
 * Format scraped results as context for the AI model
 */
export function formatScrapedContent(results: ScrapeUrlResult[]): string {
	const successfulResults = results.filter((r) => r.success && (r.markdown || r.content));

	if (successfulResults.length === 0) {
		return '';
	}

	const formattedPages = successfulResults
		.map((result, index) => {
			const content = result.markdown || result.content || '';
			// Truncate very long content to avoid context overflow
			const truncatedContent =
				content.length > 10000
					? content.substring(0, 10000) + '\n\n[Content truncated...]'
					: content;

			return `[Page ${index + 1}] ${result.title || 'Untitled'}
URL: ${result.url}

${truncatedContent}`;
		})
		.join('\n\n---\n\n');

	return `Scraped Page Content:

${formattedPages}

Instructions: Use the above scraped page content to answer the user's query. Reference the content where relevant.

`;
}
