import { session } from '$lib/state/session.svelte';
import { settings } from '$lib/state/settings.svelte';

export class AudioPlayer {
    isPlaying = $state(false);
    isLoading = $state(false);
    currentMessageId = $state<string | null>(null);
    error = $state<string | null>(null);

    private audio = new Audio();
    private currentBlobUrl: string | null = null;

    constructor() {
        // Cleanup blob URL when audio ends
        this.audio.onended = () => {
            this.stop();
        };

        this.audio.onerror = (e) => {
            console.error('[AudioPlayer] Audio error:', e);
            this.error = 'Playback failed';
            this.stop();
        };
    }

    async play(text: string, messageId: string, model: string = 'tts-1', voice: string = 'alloy') {
        // If already playing this message, toggle pause/play is not implemented yet, just stop and restart for now or ignore?
        // Let's implement Stop if clicking same message, or simple restart. 
        // Better UX: If playing same message, stop. If different, stop current and play new.

        if (this.currentMessageId === messageId && this.isPlaying) {
            this.stop();
            return;
        }

        this.stop(); // Stop any existing playback

        this.currentMessageId = messageId;
        this.isLoading = true;
        this.error = null;

        try {
            const token = session.current?.session.token;
            // Using user's API key if available in settings, or relying on server to use env var/session
            // For now, let's assume the session token or server handles auth. 
            // In +server.ts we check x-api-key header. 
            // We usually pass the user's personal key if they have one set in the UI, 
            // but `settings` store might not expose it directly depending on implementation.
            // Let's rely on the server side handling or pass what we can.

            // Actually, in `generate-message` call we pass `session_token`.
            // The `api/tts/+server.ts` checks `x-api-key`. 
            // We should use `settings.apiKey` if available? 
            // Let's check `settings.svelte`.

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // If user has a custom API key set in settings (local usage), pass it.
            // But usually we rely on the backend proxy. 
            // Let's assume the user is logged in and we use the session cookie or token.
            // Wait, my server implementation checks `request.headers.get('x-api-key')`.
            // I should check how other API calls authenticate. `generate-message` calls use `callGenerateMessage` which passes params.

            // Let's look at `src/routes/api/generate-message/+server.ts` again.
            // It uses `getUserIdFromApiKey` or `getUserIdFromSession`.
            // My `tts/+server.ts` currently only checks `x-api-key` or `env.NANOGPT_API_KEY`.
            // If I am a logged in user without a custom key, I want to use the server's key (if allowed) or my account balance.
            // The `api/tts` implementation I wrote uses `env.NANOGPT_API_KEY` as fallback. This is good for "Server Key" mode.
            // But if I want to use MY account quota, I need to pass MY key.
            // In `src/lib/state/session.svelte`, do we have the key?

            // Let's just try to fetch.

            const res = await fetch('/api/tts', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    text,
                    model: settings.ttsModel ?? model,
                    voice: settings.ttsVoice ?? voice,
                    speed: settings.ttsSpeed ?? 1.0
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to fetch audio');
            }

            const blob = await res.blob();
            this.currentBlobUrl = URL.createObjectURL(blob);
            this.audio.src = this.currentBlobUrl;

            await this.audio.play();
            this.isPlaying = true;

        } catch (e: any) {
            console.error('[AudioPlayer] Play error:', e);
            this.error = e.message;
            this.currentMessageId = null;
        } finally {
            this.isLoading = false;
        }
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.isPlaying = false;
        this.currentMessageId = null;
        this.isLoading = false;

        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }
    }
}

// Global instance
export const audioPlayer = new AudioPlayer();
