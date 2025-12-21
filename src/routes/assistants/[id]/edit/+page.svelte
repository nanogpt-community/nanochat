<script lang="ts">
    import { goto } from '$app/navigation';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Textarea } from '$lib/components/ui/textarea';
    import { ModelPicker } from '$lib/components/model-picker';
    import { settings } from '$lib/state/settings.svelte';
    import { Provider } from '$lib/types';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    let assistant = data.assistant;

    let name = $state(assistant.name);
    let description = $state(assistant.description || '');
    let systemPrompt = $state(assistant.systemPrompt);
    let loading = $state(false);

    // Initialize settings.modelId to assistant's model
    $effect(() => {
        if (assistant.modelId) {
            settings.modelId = assistant.modelId;
        }
    });

    async function handleSubmit(e: Event) {
        e.preventDefault();
        loading = true;

        try {
            const res = await fetch(`/api/db/assistants/${assistant.id}`, {
                method: 'PUT',
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
                goto('/assistants');
            } else {
                alert('Failed to update assistant');
            }
        } catch (error) {
            console.error(error);
            alert('Error updating assistant');
        } finally {
            loading = false;
        }
    }
</script>

<div class="container max-w-2xl py-10">
    <h1 class="mb-8 text-3xl font-bold">Edit Assistant</h1>

    <form onsubmit={handleSubmit} class="space-y-6">
        <div class="space-y-2">
            <Label for="name">Name</Label>
            <Input id="name" bind:value={name} required />
        </div>

        <div class="space-y-2">
            <Label for="description">Description</Label>
            <Input id="description" bind:value={description} />
        </div>

        <div class="space-y-2">
            <Label>Model</Label>
            <ModelPicker class="w-full justify-start" />
            <p class="text-xs text-muted-foreground">The assistant will use the currently selected model: {settings.modelId}</p>
        </div>

        <div class="space-y-2">
            <Label for="systemPrompt">System Prompt</Label>
            <Textarea 
                id="systemPrompt" 
                bind:value={systemPrompt} 
                required 
                class="min-h-[200px]"
            />
        </div>

        <div class="flex gap-4">
            <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" href="/assistants">Cancel</Button>
        </div>
    </form>
</div>
