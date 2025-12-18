import { SessionStorageCache } from '$lib/cache/session-cache';

export interface QueryResult<T> {
    data: T | undefined;
    error: Error | undefined;
    isLoading: boolean;
    isStale: boolean;
    refetch: () => Promise<void>;
}

export interface QueryOptions {
    cacheKey?: string;
    ttl?: number; // milliseconds
    enabled?: boolean;
    refetchInterval?: number; // milliseconds, for polling
}

const globalCache = new SessionStorageCache('api-query-cache');

/**
 * Creates a reactive query that fetches data from an API endpoint
 * Replaces useCachedQuery from convex-svelte
 */
export function useQuery<T>(
    url: string | (() => string),
    body: Record<string, unknown> | (() => Record<string, unknown>),
    options: QueryOptions = {}
): QueryResult<T> {
    const {
        cacheKey,
        ttl = 7 * 24 * 60 * 60 * 1000, // 1 week default
        enabled = true,
    } = options;

    let data = $state<T | undefined>(undefined);
    let error = $state<Error | undefined>(undefined);
    let isLoading = $state(true);
    let isStale = $state(false);

    const getUrl = () => (typeof url === 'function' ? url() : url);
    const getBody = () => (typeof body === 'function' ? body() : body);
    const getCacheKey = () => cacheKey || `${getUrl()}:${JSON.stringify(getBody())}`;

    async function fetchData() {
        if (!enabled) {
            isLoading = false;
            return;
        }

        const key = getCacheKey();

        // Check cache first
        const cached = globalCache.get(key);
        if (cached !== undefined) {
            data = cached as T;
            isStale = true;
            isLoading = false;
        }

        try {
            const response = await fetch(getUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(getBody()),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            data = result as T;
            error = undefined;
            isStale = false;

            // Cache the result
            globalCache.set(key, result, ttl);
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
            // Keep stale data if we have it
            if (!data) {
                isLoading = false;
            }
        } finally {
            isLoading = false;
        }
    }

    // Initial fetch
    $effect(() => {
        fetchData();
    });

    return {
        get data() {
            return data;
        },
        get error() {
            return error;
        },
        get isLoading() {
            return isLoading;
        },
        get isStale() {
            return isStale;
        },
        refetch: fetchData,
    };
}

/**
 * Simple GET query without body
 */
export function useGetQuery<T>(
    url: string | (() => string),
    options: QueryOptions = {}
): QueryResult<T> {
    const {
        cacheKey,
        ttl = 7 * 24 * 60 * 60 * 1000,
        enabled = true,
    } = options;

    let data = $state<T | undefined>(undefined);
    let error = $state<Error | undefined>(undefined);
    let isLoading = $state(true);
    let isStale = $state(false);

    const getUrl = () => (typeof url === 'function' ? url() : url);
    const getCacheKey = () => cacheKey || getUrl();

    async function fetchData() {
        if (!enabled) {
            isLoading = false;
            return;
        }

        const key = getCacheKey();

        // Check cache first
        const cached = globalCache.get(key);
        if (cached !== undefined) {
            data = cached as T;
            isStale = true;
            isLoading = false;
        }

        try {
            const response = await fetch(getUrl());

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            data = result as T;
            error = undefined;
            isStale = false;

            // Cache the result
            globalCache.set(key, result, ttl);
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
        } finally {
            isLoading = false;
        }
    }

    // Initial fetch
    $effect(() => {
        fetchData();
    });

    return {
        get data() {
            return data;
        },
        get error() {
            return error;
        },
        get isLoading() {
            return isLoading;
        },
        get isStale() {
            return isStale;
        },
        refetch: fetchData,
    };
}

/**
 * Invalidate a cached query
 */
export function invalidateQuery(cacheKey: string): void {
    globalCache.delete(cacheKey);
}

export function invalidateQueryPattern(urlPrefix: string): void {
    const keys = Array.from(globalCache.keys());
    for (const key of keys) {
        if (key.startsWith(urlPrefix)) {
            globalCache.delete(key);
        }
    }
}

/**
 * Clear all cached queries
 */
export function clearQueryCache(): void {
    globalCache.clear();
}

export { globalCache as queryCache };
