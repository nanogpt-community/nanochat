import { settings } from './settings.svelte';

export class AudioRecorder {
    isRecording = $state(false);
    isProcessing = $state(false);
    error = $state<string | null>(null);
    transcript = $state<string | null>(null);

    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];

    async start() {
        this.error = null;
        this.transcript = null;
        this.audioChunks = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            this.isRecording = true;
        } catch (e) {
            console.error('Failed to start recording:', e);
            this.error = 'Could not access microphone';
        }
    }

    async stop(): Promise<string | null> {
        const recorder = this.mediaRecorder;
        if (!recorder) return null;

        return new Promise((resolve) => {
            recorder.onstop = async () => {
                this.isRecording = false;
                const mimeType = recorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });

                this.isProcessing = true;
                try {
                    const formData = new FormData();
                    // Append with a filename that has an extension, API might need it.
                    // Map mime to ext if possible, or default to .webm
                    let ext = 'webm';
                    if (mimeType.includes('mp4')) ext = 'm4a';
                    if (mimeType.includes('wav')) ext = 'wav';
                    if (mimeType.includes('ogg')) ext = 'ogg'; // NanoGPT supports ogg
                    if (mimeType.includes('aac')) ext = 'aac';

                    formData.append('audio', audioBlob, `recording.${ext}`);
                    formData.append('model', settings.sttModel || 'Whisper-Large-V3');

                    const res = await fetch('/api/stt', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include'
                    });

                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || res.statusText);
                    }

                    const data = await res.json();
                    console.log('[STT] API Response:', data);
                    this.transcript = data.transcription || data.text; // Fallback to 'text' just in case
                    resolve(this.transcript);
                } catch (e: any) {
                    console.error('Transcription failed:', e);
                    this.error = e.message;
                    resolve(null);
                } finally {
                    this.isProcessing = false;
                    // Stop tracks to release microphone
                    recorder.stream.getTracks().forEach(t => t.stop());
                    this.mediaRecorder = null;
                }
            };

            if (recorder.state !== 'inactive') {
                recorder.stop();
            }
        });
    }

    cancel() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
            this.mediaRecorder = null;
        }
        this.isRecording = false;
        this.isProcessing = false;
        this.audioChunks = [];
        this.error = null;
    }
}

export const audioRecorder = new AudioRecorder();
