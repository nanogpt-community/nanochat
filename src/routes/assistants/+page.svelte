<script lang="ts">
    import { api, useCachedQuery } from '$lib/cache/cached-query.svelte';
    import { session } from '$lib/state/session.svelte';
    import { Button } from '$lib/components/ui/button';
    import PlusIcon from '~icons/lucide/plus';
    import PencilIcon from '~icons/lucide/pencil';
    import TrashIcon from '~icons/lucide/trash-2';
    import ArrowLeft from '~icons/lucide/arrow-left';
    import * as Card from "$lib/components/ui/card";

    const assistantsQuery = useCachedQuery(api.assistants.all, () => ({
        session_token: session.current?.session.token ?? '',
    }));

    async function deleteAssistant(id: string) {
        if (!confirm('Are you sure you want to delete this assistant?')) return;
        
        try {
            const res = await fetch(`/api/db/assistants/${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                assistantsQuery.refetch?.();
            }
        } catch (e) {
            console.error(e);
        }
    }
</script>

<div class="container mx-auto max-w-4xl py-10">
    <div class="mb-4">
        <Button variant="ghost" size="sm" href="/chat" class="gap-2">
            <ArrowLeft class="size-4" />
            Back to Chat
        </Button>
    </div>
    <div class="mb-8 flex items-center justify-between">
        <h1 class="text-3xl font-bold">Assistants</h1>
        <Button href="/assistants/create">
            <PlusIcon class="mr-2 size-4" />
            Create Assistant
        </Button>
    </div>

    {#if assistantsQuery.error}
        <div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/50 p-12 text-center">
            <h3 class="text-lg font-semibold text-destructive">Error loading assistants</h3>
            <p class="text-muted-foreground mt-2 mb-4">{assistantsQuery.error.message}</p>
            <Button onclick={() => assistantsQuery.refetch?.()}>Retry</Button>
        </div>
    {:else if assistantsQuery.isLoading && !assistantsQuery.data}
        <p>Loading...</p>
    {:else if assistantsQuery.data?.length === 0}
        <div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 class="text-lg font-semibold">No assistants yet</h3>
            <p class="text-muted-foreground mt-2 mb-4">Create your first custom assistant to get started.</p>
            <Button href="/assistants/create">Create Assistant</Button>
        </div>
    {:else}
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {#each assistantsQuery.data ?? [] as assistant (assistant.id)}
                <Card.Root>
                    <Card.Header>
                        <Card.Title>{assistant.name}</Card.Title>
                        <Card.Description>{assistant.description || 'No description'}</Card.Description>
                    </Card.Header>
                    <Card.Content>
                        <p class="text-sm text-muted-foreground line-clamp-3">
                            {assistant.systemPrompt}
                        </p>
                        <div class="mt-2 text-xs opacity-70">
                            Model: {assistant.modelId}
                        </div>
                    </Card.Content>
                    <Card.Footer class="flex justify-end gap-2">
                        <Button variant="outline" size="icon" href={`/assistants/${assistant.id}/edit`}>
                            <PencilIcon class="size-4" />
                        </Button>
                        <Button variant="destructive" size="icon" onclick={() => deleteAssistant(assistant.id)}>
                            <TrashIcon class="size-4" />
                        </Button>
                    </Card.Footer>
                </Card.Root>
            {/each}
        </div>
    {/if}
</div>
