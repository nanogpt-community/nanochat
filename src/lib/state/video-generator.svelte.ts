import { toast } from 'svelte-sonner';

export type VideoGenerationStatus = 'idle' | 'submitting' | 'queued' | 'pending' | 'processing' | 'completed' | 'failed';

export interface VideoGenerationResult {
    runId: string;
    model: string;
    status: VideoGenerationStatus;
    videoUrl?: string;
    cost?: number;
    error?: string;
    prompt: string;
    createdAt: number;
}

export class VideoGenerator {
    current = $state<VideoGenerationResult | null>(null);
    history = $state<VideoGenerationResult[]>([]);
    isGenerating = $state(false);

    async generate(params: { model: string; prompt: string;[key: string]: any }) {
        if (this.isGenerating) {
            toast.error('Already generating a video');
            return;
        }

        this.isGenerating = true;
        const tempId = crypto.randomUUID();

        // Optimistic UI or placeholder
        const generation: VideoGenerationResult = {
            runId: '',
            model: params.model,
            status: 'submitting',
            prompt: params.prompt,
            createdAt: Date.now()
        };
        this.current = generation;

        try {
            toast.info('Starting video generation...');

            const response = await fetch('/api/video/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to start generation');
            }

            const data = await response.json();
            generation.runId = data.runId;
            generation.status = 'queued'; // or pending
            this.current = generation;

            toast.success('Video generation started!');
            this.poll(generation.runId, params.model);

        } catch (e: any) {
            console.error('Video Generation Error:', e);
            generation.status = 'failed';
            generation.error = e.message;
            this.current = generation;
            this.isGenerating = false;
            toast.error(`Video Generation Failed: ${e.message}`);
        }
    }

    async poll(runId: string, model: string) {
        const pollInterval = 5000;
        const maxAttempts = 120; // 10 minutes
        let attempts = 0;

        const checkParams = new URLSearchParams({ runId, model });

        const poller = async () => {
            if (attempts >= maxAttempts) {
                if (this.current && this.current.runId === runId) {
                    this.current.status = 'failed';
                    this.current.error = 'Timed out';
                    this.isGenerating = false;
                    toast.error('Video generation timed out');
                }
                return;
            }
            attempts++;

            try {
                const res = await fetch(`/api/video/status?${checkParams}`);
                if (!res.ok) {
                    // Retry on network error? Or fail?
                    console.warn('Poll failed, retrying...');
                    setTimeout(poller, pollInterval);
                    return;
                }

                const data = await res.json();
                const apiStatus = data.data?.status; // IN_QUEUE, IN_PROGRESS, COMPLETED, FAILED

                if (this.current && this.current.runId === runId) {
                    if (apiStatus === 'COMPLETED') {
                        this.current.status = 'completed';
                        this.current.videoUrl = data.data?.output?.video?.url;
                        this.current.cost = data.data?.cost;
                        this.isGenerating = false;
                        this.history.unshift({ ...this.current });
                        toast.success('Video generated successfully!');
                    } else if (apiStatus === 'FAILED' || apiStatus === 'CANCELED') {
                        this.current.status = 'failed';
                        this.current.error = data.data?.error || 'Generation failed';
                        this.isGenerating = false;
                        toast.error(`Video generation failed: ${this.current.error}`);
                    } else {
                        this.current.status = apiStatus === 'IN_QUEUE' ? 'queued' : 'processing';
                        setTimeout(poller, pollInterval);
                    }
                }
            } catch (e) {
                console.error('Poll Error:', e);
                setTimeout(poller, pollInterval);
            }
        };

        setTimeout(poller, pollInterval);
    }

    reset() {
        if (!this.isGenerating) {
            this.current = null;
        }
    }
}

export const videoGenerator = new VideoGenerator();
