import { extractTextFromPDF } from '$lib/utils/pdf-extraction';
import { extractTextFromEPUB } from '$lib/utils/epub-extraction';

/**
 * Parsers are the most expensive thing a request can trigger (a child process or
 * an in-process archive expansion), so they run through one small slot pool.
 */
// ponytail: process-local; put a queue in front of it if parsing moves to workers
const MAX_CONCURRENT_PARSERS = 2;
const CACHE_MAX = 200;

let active = 0;
const waiting: Array<() => void> = [];

export async function withParserSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (active >= MAX_CONCURRENT_PARSERS) {
		await new Promise<void>((resolve) => waiting.push(resolve));
	}
	active++;
	try {
		return await fn();
	} finally {
		active--;
		waiting.shift()?.();
	}
}

const cache = new Map<string, Promise<string>>();

/**
 * One extraction per stored document. A document stays in the conversation and
 * used to be re-parsed on every later turn; concurrent turns listing the same
 * id now share a single in-flight job as well.
 */
export function extractStoredDocumentText(
	storageId: string,
	path: string,
	kind: 'pdf' | 'epub'
): Promise<string> {
	const key = `${kind}:${storageId}`;
	const hit = cache.get(key);
	if (hit) {
		// refresh LRU position
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}

	const job = withParserSlot(() =>
		kind === 'pdf' ? extractTextFromPDF(path) : extractTextFromEPUB(path)
	);
	cache.set(key, job);
	job.catch(() => cache.delete(key));
	if (cache.size > CACHE_MAX) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	return job;
}
