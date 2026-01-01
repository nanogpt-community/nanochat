<script lang="ts">
	import { mutate } from '$lib/client/mutation.svelte';
	import { api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Modal from '$lib/components/ui/modal/modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import Label from '$lib/components/ui/label/label.svelte';

	let { open = $bindable(false) } = $props();

	let name = $state('');
	let description = $state('');
	let systemPrompt = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!name.trim()) return;

		loading = true;
		try {
			await mutate(api.projects.create.url, {
				name,
				description,
				systemPrompt,
			});

			invalidateQueryPattern(api.projects.list.url);
			open = false;
			name = '';
			description = '';
			systemPrompt = '';
		} catch (err) {
			console.error('Failed to create project:', err);
		} finally {
			loading = false;
		}
	}
</script>

<Modal bind:open>
	<h3 class="text-lg font-bold">Create New Project</h3>

	<form onsubmit={handleSubmit} class="mt-4 flex flex-col gap-4">
		<div class="flex flex-col gap-2">
			<Label for="project-name">Name</Label>
			<Input id="project-name" bind:value={name} placeholder="Project Name" required autofocus />
		</div>

		<div class="flex flex-col gap-2">
			<Label for="project-desc">Description (Optional)</Label>
			<Input id="project-desc" bind:value={description} placeholder="Short description" />
		</div>

		<div class="flex flex-col gap-2">
			<Label for="project-prompt">Custom Instructions (Optional)</Label>
			<Textarea
				id="project-prompt"
				bind:value={systemPrompt}
				placeholder="System prompt/instructions for all chats in this project..."
				rows={4}
			/>
			<p class="text-muted-foreground text-xs">
				These instructions will be appended to the system prompt for every chat in this project.
			</p>
		</div>

		<div class="modal-action mt-4 flex justify-end gap-2">
			<Button variant="outline" type="button" onclick={() => (open = false)} disabled={loading}>
				Cancel
			</Button>
			<Button type="submit" disabled={loading || !name.trim()}>
				{loading ? 'Creating...' : 'Create Project'}
			</Button>
		</div>
	</form>
</Modal>
