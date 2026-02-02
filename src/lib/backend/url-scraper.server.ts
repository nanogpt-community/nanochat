/**
 * Server-side URL scraping utilities.
 * Uses NanoGPT's Web Scraping API (https://nano-gpt.com/api/scrape-urls)
 */

import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import {
	extractUrls,
	extractUrlsByType,
	extractYouTubeVideoId,
	formatScrapedContent,
	type ScrapeResponse,
	type ScrapeUrlResult,
	type ScrapeSummary,
} from './url-scraper';

const NANO_GPT_SCRAPE_PATH = '/api/scrape-urls';

export { extractUrls, extractUrlsByType, extractYouTubeVideoId, formatScrapedContent };
export type { ScrapeResponse, ScrapeUrlResult, ScrapeSummary };

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
		const response = await fetch(nanoGptUrl(NANO_GPT_SCRAPE_PATH), {
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

		const data = (await response.json()) as ScrapeResponse;
		return data;
	} catch (error) {
		console.error(`[URL Scraper] Failed to scrape URLs: ${error}`);
		return null;
	}
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

	console.log(
		`[URL Scraper] Scraped ${response.summary.successful}/${response.summary.requested} URLs successfully`
	);

	return {
		content: formatScrapedContent(response.results),
		successCount: response.summary.successful,
	};
}
