/**
 * API wrapper to replace Convex API calls
 * This module provides a drop-in replacement for the Convex API patterns
 * using local SQLite + Drizzle backend via SvelteKit API routes
 */

// Re-export types from database schema
export type {
    UserSettings,
    UserKey,
    UserEnabledModel,
    UserRule,
    Conversation,
    Message,
    Storage,
    User,
    Session,
    Assistant,
    Project,
    ProjectFile,
    ProjectMember,
} from '$lib/db/schema';

// Type aliases for backwards compatibility with Convex patterns
export type Doc<T extends keyof DocTypes> = DocTypes[T];
export type Id<T extends keyof DocTypes> = string;

interface DocTypes {
    user_settings: import('$lib/db/schema').UserSettings;
    user_keys: import('$lib/db/schema').UserKey;
    user_enabled_models: import('$lib/db/schema').UserEnabledModel;
    user_rules: import('$lib/db/schema').UserRule;
    conversations: import('$lib/db/schema').Conversation;
    messages: import('$lib/db/schema').Message;
    storage: import('$lib/db/schema').Storage;
    assistants: import('$lib/db/schema').Assistant;
    projects: import('$lib/db/schema').Project;
    project_files: import('$lib/db/schema').ProjectFile;
    project_members: import('$lib/db/schema').ProjectMember;
}

// API endpoints mapping - these replace the Convex API object
const API_BASE = '/api/db';

export const api = {
    conversations: {
        get: `${API_BASE}/conversations`,
        getById: (id: string) => `${API_BASE}/conversations?id=${id}`,
        create: `${API_BASE}/conversations`,
        search: (term: string, mode?: string) =>
            `${API_BASE}/conversations?search=${encodeURIComponent(term)}${mode ? `&mode=${mode}` : ''}`,
        deleteAll: `${API_BASE}/conversations?all=true`,
    },
    messages: {
        getAllFromConversation: (conversationId: string) =>
            `${API_BASE}/messages?conversationId=${conversationId}`,
        getByConversationPublic: (conversationId: string) =>
            `${API_BASE}/messages?conversationId=${conversationId}&public=true`,
        create: `${API_BASE}/messages`,
        delete: { url: `${API_BASE}/messages` },
        setStarred: { url: `${API_BASE}/messages` },
    },
    starred_messages: {
        get: '/api/starred-messages',
    },
    user_settings: {
        get: `${API_BASE}/user-settings`,
        set: `${API_BASE}/user-settings`,
    },
    user_keys: {
        all: `${API_BASE}/user-keys`,
        get: (provider: string) => `${API_BASE}/user-keys?provider=${provider}`,
        set: `${API_BASE}/user-keys`,
    },
    user_enabled_models: {
        get_enabled: `${API_BASE}/user-models`,
        get: (provider: string, modelId: string) =>
            `${API_BASE}/user-models?provider=${provider}&modelId=${encodeURIComponent(modelId)}`,
        set: `${API_BASE}/user-models`,
    },
    user_rules: {
        all: `${API_BASE}/user-rules`,
        create: `${API_BASE}/user-rules`,
    },
} as const;

// Helper to make API calls
export async function apiCall<T>(
    endpoint: string,
    options?: {
        method?: 'GET' | 'POST' | 'DELETE';
        body?: Record<string, unknown>;
    }
): Promise<T> {
    const { method = 'GET', body } = options ?? {};

    const response = await fetch(endpoint, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}
