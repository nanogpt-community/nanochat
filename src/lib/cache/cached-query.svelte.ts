/**
 * Compatibility layer for replacing Convex queries with local API calls
 * This module provides the same interface as the original useCachedQuery
 * but uses fetch requests to local SvelteKit API routes
 */
import { SessionStorageCache } from './session-cache.js';
import { extract, watch } from 'runed';

export interface CachedQueryOptions {
	cacheKey?: string;
	ttl?: number;
	staleWhileRevalidate?: boolean;
	enabled?: boolean;
}

export interface QueryResult<T> {
	data: T | undefined;
	error: Error | undefined;
	isLoading: boolean;
	isStale: boolean;
	refetch?: () => Promise<void>;
}

const globalCache = new SessionStorageCache('query-cache');

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

function subscribeToCacheInvalidation(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function notifyInvalidation(key: string) {
	listeners.forEach((listener) => listener(key));
}

/**
 * Wrapper to make API queries compatible with the old Convex pattern
 * The `query` parameter is now expected to be a string URL or a config object
 */
export function useCachedQuery<TResult>(
	queryConfig: QueryConfig,
	queryArgs: Record<string, unknown> | (() => Record<string, unknown>),
	options: CachedQueryOptions = {}
): QueryResult<TResult> {
	const {
		cacheKey,
		ttl = 7 * 24 * 60 * 60 * 1000, // 1 week default
		enabled = true,
	} = options;

	let data = $state<TResult | undefined>(undefined);
	let error = $state<Error | undefined>(undefined);
	let isLoading = $state(true);
	let isStale = $state(false);

	const getArgs = () => (typeof queryArgs === 'function' ? queryArgs() : queryArgs);
	const getCacheKey = () => cacheKey || `${queryConfig.url}:${JSON.stringify(getArgs())}`;

	async function fetchData() {
		if (!enabled) {
			isLoading = false;
			return;
		}

		const key = getCacheKey();

		// Check cache first
		const cached = globalCache.get(key);
		if (cached !== undefined) {
			data = cached as TResult;
			isStale = true;
			isLoading = false;
		}

		try {
			const args = getArgs();
			let url = queryConfig.url;

			// Build URL with query params for GET requests, or use POST
			if (queryConfig.method === 'GET' || !queryConfig.method) {
				const params = new URLSearchParams();
				for (const [key, value] of Object.entries(args)) {
					if (value !== undefined && value !== null && key !== 'session_token') {
						params.set(key, String(value));
					}
				}
				const queryString = params.toString();
				if (queryString) {
					url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
				}
			}

			const response = await fetch(url, {
				method: queryConfig.method || 'GET',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include', // Include cookies for session
				cache: 'no-store',
				...(queryConfig.method === 'POST' ? { body: JSON.stringify(args) } : {}),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			data = result as TResult;
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

	// Watch for argument changes and match cache keys
	$effect(() => {
		const _ = extract(queryArgs);
		fetchData();
	});

	// Subscribe to cache invalidations
	$effect(() => {
		const unsubscribe = subscribeToCacheInvalidation((key) => {
			const currentKey = getCacheKey();
			if (key === currentKey || (key.endsWith('*') && currentKey.startsWith(key.slice(0, -1)))) {
				fetchData();
			}
		});

		return unsubscribe;
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

export interface QueryConfig {
	url: string;
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
}

// API definition that mimics Convex's api object structure
export const api = {
	conversations: {
		get: { url: '/api/db/conversations', method: 'GET' } as QueryConfig,
		getById: { url: '/api/db/conversations', method: 'GET' } as QueryConfig,
		getPublicById: { url: '/api/db/conversations', method: 'GET' } as QueryConfig,
		search: { url: '/api/db/conversations', method: 'GET' } as QueryConfig,
		// Mutations
		create: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		createAndAddMessage: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		createBranched: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		updateTitle: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		updateGenerating: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		updateCostUsd: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		setPublic: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		togglePin: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		remove: { url: '/api/db/conversations', method: 'POST' } as QueryConfig,
		deleteAll: { url: '/api/db/conversations?all=true', method: 'DELETE' } as QueryConfig,
	},
	messages: {
		getAllFromConversation: { url: '/api/db/messages', method: 'GET' } as QueryConfig,
		getByConversationPublic: { url: '/api/db/messages', method: 'GET' } as QueryConfig,
		create: { url: '/api/db/messages', method: 'POST' } as QueryConfig,
		updateContent: { url: '/api/db/messages', method: 'POST' } as QueryConfig,
		updateMessage: { url: '/api/db/messages', method: 'POST' } as QueryConfig,
		updateError: { url: '/api/db/messages', method: 'POST' } as QueryConfig,
		delete: { url: '/api/db/messages', method: 'POST' } as QueryConfig,
	},
	user_settings: {
		get: { url: '/api/db/user-settings', method: 'GET' } as QueryConfig,
		set: { url: '/api/db/user-settings', method: 'POST' } as QueryConfig,
		create: { url: '/api/db/user-settings', method: 'POST' } as QueryConfig,
		incrementFreeMessageCount: { url: '/api/db/user-settings', method: 'POST' } as QueryConfig,
	},
	user_keys: {
		all: { url: '/api/db/user-keys', method: 'GET' } as QueryConfig,
		get: { url: '/api/db/user-keys', method: 'GET' } as QueryConfig,
		set: { url: '/api/db/user-keys', method: 'POST' } as QueryConfig,
	},
	user_enabled_models: {
		get_enabled: { url: '/api/db/user-models', method: 'GET' } as QueryConfig,
		get: { url: '/api/db/user-models', method: 'GET' } as QueryConfig,
		is_enabled: { url: '/api/db/user-models', method: 'GET' } as QueryConfig,
		set: { url: '/api/db/user-models', method: 'POST' } as QueryConfig,
		toggle_pinned: { url: '/api/db/user-models', method: 'POST' } as QueryConfig,
		enable_initial: { url: '/api/db/user-models', method: 'POST' } as QueryConfig,
	},
	user_rules: {
		all: { url: '/api/db/user-rules', method: 'GET' } as QueryConfig,
		create: { url: '/api/db/user-rules', method: 'POST' } as QueryConfig,
		update: { url: '/api/db/user-rules', method: 'POST' } as QueryConfig,
		rename: { url: '/api/db/user-rules', method: 'POST' } as QueryConfig,
		remove: { url: '/api/db/user-rules', method: 'POST' } as QueryConfig,
	},
	storage: {
		generateUploadUrl: { url: '/api/storage/upload-url', method: 'POST' } as QueryConfig,
		getUrl: { url: '/api/storage/url', method: 'GET' } as QueryConfig,
		deleteFile: { url: '/api/storage/delete', method: 'POST' } as QueryConfig,
	},
	assistants: {
		list: { url: '/api/assistants', method: 'GET' } as QueryConfig,
		create: { url: '/api/assistants', method: 'POST' } as QueryConfig,
		update: { url: '/api/assistants', method: 'PATCH' } as QueryConfig, // client side needs to append /id
		delete: { url: '/api/assistants', method: 'DELETE' } as QueryConfig, // client side needs to append /id
	},
	projects: {
		list: { url: '/api/projects', method: 'GET' } as QueryConfig,
		get: { url: '/api/projects', method: 'GET' } as QueryConfig, // client side needs to append /id
		create: { url: '/api/projects', method: 'POST' } as QueryConfig,
		update: { url: '/api/projects', method: 'PATCH' } as QueryConfig, // client side needs to append /id
		delete: { url: '/api/projects', method: 'DELETE' } as QueryConfig, // client side needs to append /id
		files: { url: '/api/projects', method: 'GET' } as QueryConfig, // client side needs to append /id/files
		uploadFile: { url: '/api/projects', method: 'POST' } as QueryConfig, // client side needs to append /id/files
		deleteFile: { url: '/api/projects', method: 'DELETE' } as QueryConfig, // client side needs to append /id/files
		members: { url: '/api/projects', method: 'GET' } as QueryConfig, // client side needs to append /id/members
		addMember: { url: '/api/projects', method: 'POST' } as QueryConfig, // client side needs to append /id/members
		removeMember: { url: '/api/projects', method: 'DELETE' } as QueryConfig, // client side needs to append /id/members
	},
	followUpQuestions: {
		generate: { url: '/api/generate-follow-up-questions', method: 'POST' } as QueryConfig,
	},
	// Shim for betterAuth - not needed with new setup
	betterAuth: {
		publicGetSession: { url: '/api/auth/session', method: 'GET' } as QueryConfig,
	},
	artificial_analysis: {
		benchmarks: { url: '/api/artificial-analysis/benchmarks', method: 'GET' } as QueryConfig,
	},
} as const;

export function invalidateQuery(query: QueryConfig, queryArgs?: unknown): void {
	const key = `${query.url}:${JSON.stringify(queryArgs || {})}`;
	globalCache.delete(key);
	notifyInvalidation(key);
}

export function invalidateQueryPattern(urlPrefix: string): void {
	const keys = Array.from(globalCache.keys());
	for (const key of keys) {
		if (key.startsWith(urlPrefix)) {
			globalCache.delete(key);
		}
	}
	// Notify with a special wildcard syntax that our subscriber understands
	notifyInvalidation(`${urlPrefix}*`);
}

export function clearQueryCache(): void {
	globalCache.clear();
}

export { globalCache as queryCache };
