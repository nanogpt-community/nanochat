import type { Message, Conversation } from '$lib/api';

/**
 * In-memory state manager for temporary chats.
 * Chats stored here are not persisted to the database and will be lost on page refresh.
 * Uses sessionStorage to persist across navigation within the same tab.
 */

interface TemporaryConversation extends Omit<Conversation, 'userId' | 'temporary'> {
    isTemporary: true;
    temporary?: boolean;
}

interface TemporaryMessage extends Omit<Message, 'conversationId'> {
    conversationId: string;
}

interface TemporaryChatState {
    conversations: Map<string, TemporaryConversation>;
    messages: Map<string, TemporaryMessage[]>;
}

const STORAGE_KEY = 'temporary-chats';

function loadFromSession(): TemporaryChatState {
    if (typeof window === 'undefined') {
        return { conversations: new Map(), messages: new Map() };
    }

    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                conversations: new Map(Object.entries(parsed.conversations || {})),
                messages: new Map(Object.entries(parsed.messages || {})),
            };
        }
    } catch (e) {
        console.error('Failed to load temporary chats from session:', e);
    }

    return { conversations: new Map(), messages: new Map() };
}

function saveToSession(state: TemporaryChatState): void {
    if (typeof window === 'undefined') return;

    try {
        const serializable = {
            conversations: Object.fromEntries(state.conversations),
            messages: Object.fromEntries(state.messages),
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
        console.error('Failed to save temporary chats to session:', e);
    }
}

// Initialize state
let state = $state<TemporaryChatState>(loadFromSession());

// Generate a temporary conversation ID
export function generateTemporaryId(): string {
    return `temp:${crypto.randomUUID()}`;
}

// Check if an ID is a temporary conversation
export function isTemporaryConversation(id: string | undefined): boolean {
    return id?.startsWith('temp:') ?? false;
}

// Create a new temporary conversation
export function createTemporaryConversation(title: string = 'Temporary Chat'): TemporaryConversation {
    const id = generateTemporaryId();
    const now = new Date();

    const conversation: TemporaryConversation = {
        id,
        title,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        generating: false,
        costUsd: null,
        public: false,
        branchedFrom: null,
        assistantId: null,
        isTemporary: true,
        projectId: null,
    };

    state.conversations.set(id, conversation);
    state.messages.set(id, []);
    saveToSession(state);

    return conversation;
}

// Get a temporary conversation by ID
export function getTemporaryConversation(id: string): TemporaryConversation | undefined {
    return state.conversations.get(id);
}

// Get all temporary conversations
export function getTemporaryConversations(): TemporaryConversation[] {
    return Array.from(state.conversations.values()).sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
    });
}

// Update a temporary conversation
export function updateTemporaryConversation(
    id: string,
    updates: Partial<Omit<TemporaryConversation, 'id' | 'isTemporary'>>
): void {
    const conversation = state.conversations.get(id);
    if (conversation) {
        Object.assign(conversation, updates, { updatedAt: new Date() });
        saveToSession(state);
    }
}

// Add a message to a temporary conversation
export function addTemporaryMessage(
    conversationId: string,
    message: Omit<TemporaryMessage, 'conversationId' | 'id' | 'createdAt'>
): TemporaryMessage {
    const id = `temp-msg:${crypto.randomUUID()}`;
    const now = new Date();

    const fullMessage: TemporaryMessage = {
        ...message,
        id,
        conversationId,
        createdAt: now,
    };

    const messages = state.messages.get(conversationId) || [];
    messages.push(fullMessage);
    state.messages.set(conversationId, messages);

    // Update conversation timestamp
    const conversation = state.conversations.get(conversationId);
    if (conversation) {
        conversation.updatedAt = now;
    }

    saveToSession(state);
    return fullMessage;
}

// Update a temporary message
export function updateTemporaryMessage(
    conversationId: string,
    messageId: string,
    updates: Partial<Omit<TemporaryMessage, 'id' | 'conversationId' | 'createdAt'>>
): void {
    const messages = state.messages.get(conversationId);
    if (messages) {
        const messageIndex = messages.findIndex((m) => m.id === messageId);
        if (messageIndex !== -1 && messages[messageIndex]) {
            Object.assign(messages[messageIndex] as object, updates);
            saveToSession(state);
        }
    }
}

// Get messages for a temporary conversation
export function getTemporaryMessages(conversationId: string): TemporaryMessage[] {
    return state.messages.get(conversationId) || [];
}

// Delete a temporary conversation and its messages
export function deleteTemporaryConversation(id: string): void {
    state.conversations.delete(id);
    state.messages.delete(id);
    saveToSession(state);
}

// Clear all temporary chats
export function clearAllTemporaryChats(): void {
    state.conversations.clear();
    state.messages.clear();
    saveToSession(state);
}

// Get the reactive state for use in components
export function useTemporaryChats() {
    return {
        get conversations() {
            return getTemporaryConversations();
        },
        get hasConversations() {
            return state.conversations.size > 0;
        },
    };
}
