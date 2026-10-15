import { invalidateQuery, invalidateQueryPattern } from '#lib/cache/cached-query.svelte.js';

export interface MutationResult<T> {
	data: T | undefined;
	error: Error | undefined;
	isLoading: boolean;
}

export interface MutationOptions {
	/** Cache keys to invalidate after successful mutation */
	invalidateKeys?: string[];
	/** Cache patterns (URL prefixes) to invalidate after successful mutation */
	invalidatePatterns?: string[];
	/** Callback after successful mutation */
	onSuccess?: (data: unknown) => void;
	/** Callback after failed mutation */
	onError?: (error: Error) => void;
}

/**
 * Execute a mutation (POST/PATCH/DELETE request to API)
 */
export async function mutate<T = unknown>(
	url: string,
	body: Record<string, unknown>,
	options: MutationOptions = {}
): Promise<T> {
	const { invalidateKeys = [], invalidatePatterns = [], onSuccess, onError } = options;

	// Extract method from body if present, default to POST
	const { method = 'POST', ...restBody } = body;
	const httpMethod = typeof method === 'string' ? method.toUpperCase() : 'POST';

	try {
		const fetchOptions: RequestInit = {
			method: httpMethod,
			headers: { 'Content-Type': 'application/json' },
		};

		// Only include body for methods that support it
		if (httpMethod !== 'GET' && httpMethod !== 'DELETE') {
			fetchOptions.body = JSON.stringify(restBody);
		} else if (Object.keys(restBody).length > 0) {
			// For DELETE with body data, still include it
			fetchOptions.body = JSON.stringify(restBody);
		}

		const response = await fetch(url, fetchOptions);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(errorText || `HTTP error! status: ${response.status}`);
		}

		const result = await response.json();

		// Invalidate cache keys
		for (const key of invalidateKeys) {
			invalidateQuery({ url: key });
		}

		// Invalidate cache patterns
		for (const pattern of invalidatePatterns) {
			invalidateQueryPattern(pattern);
		}

		onSuccess?.(result);
		return result as T;
	} catch (e) {
		const error = e instanceof Error ? e : new Error(String(e));
		onError?.(error);
		throw error;
	}
}

/**
 * Create a mutation function with options pre-configured
 */
export function createMutation<TInput = Record<string, unknown>, TOutput = unknown>(
	url: string,
	options: MutationOptions = {}
) {
	let isLoading = $state(false);
	let error = $state<Error | undefined>(undefined);
	let data = $state<TOutput | undefined>(undefined);

	async function execute(body: TInput): Promise<TOutput> {
		isLoading = true;
		error = undefined;

		try {
			const result = await mutate<TOutput>(url, body as Record<string, unknown>, options);
			data = result;
			return result;
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e));
			throw error;
		} finally {
			isLoading = false;
		}
	}

	return {
		execute,
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get data() {
			return data;
		},
	};
}
