<script lang="ts">
    import { goto } from '$app/navigation';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Textarea } from '$lib/components/ui/textarea';
    import { ModelPicker } from '$lib/components/model-picker';
    import { settings } from '$lib/state/settings.svelte';
    import { Provider } from '$lib/types';
    import ArrowLeft from '~icons/lucide/arrow-left';
    import { invalidateQueryPattern, queryCache } from '$lib/cache/cached-query.svelte';
    import { session } from '$lib/state/session.svelte';

    let name = $state('');
    let description = $state('');
    let systemPrompt = $state('');
    let loading = $state(false);

    async function handleSubmit(e: Event) {
        e.preventDefault();
        
        // Validate that a model is selected
        if (!settings.modelId) {
            alert('Please select a model before creating the assistant');
            return;
        }
        
        loading = true;

        try {
            const res = await fetch('/api/db/assistants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description,
                    modelId: settings.modelId,
                    provider: Provider.NanoGPT,
                    systemPrompt,
                }),
            });

            if (res.ok) {
                // Prefetch the assistants list to populate cache before navigation
                try {
                    const assistantsRes = await fetch('/api/db/assistants', {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                    });
                    if (assistantsRes.ok) {
                        const assistants = await assistantsRes.json();
                        // Populate cache with the correct key format
                        const cacheKey = `/api/db/assistants:{"session_token":"${session.current?.session.token ?? ''}"}`;  
                        queryCache.set(cacheKey, assistants, 7 * 24 * 60 * 60 * 1000);
                    }
                } catch (e) {
                    console.error('Failed to prefetch assistants:', e);
                }
                await goto('/assistants');
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
                console.error('Failed to create assistant:', errorData);
                alert(`Failed to create assistant: ${errorData.message || res.statusText}`);
            }
        } catch (error) {
            console.error('Error creating assistant:', error);
            alert('Error creating assistant. Please try again.');
        } finally {
            loading = false;
        }
    }
</script>

<div class="container mx-auto max-w-2xl py-10">
    <div class="mb-4">
        <Button variant="ghost" size="sm" href="/assistants" class="gap-2">
            <ArrowLeft class="size-4" />
            Back to Assistants
        </Button>
    </div>
    <h1 class="mb-8 text-3xl font-bold">Create Assistant</h1>

    <form onsubmit={handleSubmit} class="space-y-6">
        <div class="grid w-full gap-1.5">
            <Label for="name">Name</Label>
            <Input id="name" bind:value={name} required placeholder="My Assistant" />
        </div>

        <div class="grid w-full gap-1.5">
            <Label for="description">Description</Label>
            <Input id="description" bind:value={description} placeholder="Short description..." />
        </div>

        <div class="grid w-full gap-1.5">
            <Label>Model <span class="text-destructive">*</span></Label>
            <ModelPicker class="w-full justify-start" />
            {#if settings.modelId}
                <p class="text-xs text-muted-foreground">Selected model: {settings.modelId}</p>
            {:else}
                <p class="text-xs text-destructive">Please select a model</p>
            {/if}
        </div>

        <div class="grid w-full gap-1.5">
            <Label for="systemPrompt">System Prompt</Label>
            <Textarea 
                id="systemPrompt" 
                bind:value={systemPrompt} 
                required 
                placeholder="You are a helpful assistant..." 
                class="min-h-[200px]"
            />
        </div>

        <div class="flex gap-4">
            <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Assistant'}
            </Button>
            <Button variant="outline" href="/assistants">Cancel</Button>
        </div>
    </form>
</div>
