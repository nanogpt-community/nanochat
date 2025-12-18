import { invalidateQuery, invalidateQueryPattern } from './query.svelte';

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
 * Execute a mutation (POST request to API)
 */
export async function mutate<T = unknown>(
    url: string,
    body: Record<string, unknown>,
    options: MutationOptions = {}
): Promise<T> {
    const { invalidateKeys = [], invalidatePatterns = [], onSuccess, onError } = options;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // Invalidate cache keys
        for (const key of invalidateKeys) {
            invalidateQuery(key);
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
