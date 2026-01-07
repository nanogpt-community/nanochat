<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import KeyIcon from '~icons/lucide/key';
	import PlusIcon from '~icons/lucide/plus';
	import TrashIcon from '~icons/lucide/trash-2';
	import CopyIcon from '~icons/lucide/copy';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let newKeyName = $state('');
	let newlyCreatedKey = $state<string | null>(null);
	let creating = $state(false);

	async function createKey() {
		if (!newKeyName.trim()) return;
		creating = true;

		try {
			const res = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newKeyName }),
			});

			if (!res.ok) throw new Error('Failed to create key');

			const result = await res.json();
			newlyCreatedKey = result.key;
			newKeyName = '';
			await invalidateAll();
			toast.success('API key created');
		} catch (e) {
			toast.error('Failed to create API key');
		} finally {
			creating = false;
		}
	}

	async function deleteKey(id: string) {
		try {
			const res = await fetch('/api/api-keys', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id }),
			});

			if (!res.ok) throw new Error('Failed to delete key');

			await invalidateAll();
			toast.success('API key deleted');
		} catch (e) {
			toast.error('Failed to delete API key');
		}
	}

	function copyKey(key: string) {
		navigator.clipboard.writeText(key);
		toast.success('Copied to clipboard');
	}

	function formatDate(date: Date | null) {
		if (!date) return 'Never';
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(new Date(date));
	}
</script>

<svelte:head>
	<title>Developer | nanochat</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-bold">Developer</h1>
	<p class="text-muted-foreground mt-2 text-sm">
		Personal Access Tokens for API authentication. Use these keys with the
		<code class="bg-muted rounded px-1">Authorization: Bearer &lt;KEY&gt;</code> header.
	</p>
</div>

<Card.Root class="mt-8">
	<Card.Header>
		<Card.Title>
			<KeyIcon class="inline size-4" />
			API Keys
		</Card.Title>
		<Card.Description>Generate and manage your personal access tokens.</Card.Description>
	</Card.Header>
	<Card.Content>
		<!-- Create new key form -->
		<div class="mb-6 flex gap-2">
			<Input
				bind:value={newKeyName}
				placeholder="Key name (e.g., CLI Script)"
				class="flex-1"
			/>
			<Button onclick={createKey} disabled={creating || !newKeyName.trim()}>
				<PlusIcon class="mr-1 size-4" />
				Generate Key
			</Button>
		</div>

		<!-- Show newly created key (only visible once) -->
		{#if newlyCreatedKey}
			<div class="mb-6 rounded-lg border border-green-500 bg-green-500/10 p-4">
				<p class="mb-2 text-sm font-medium text-green-600">
					Key created! Copy it now - you won't be able to see it again.
				</p>
				<div class="flex items-center gap-2">
					<code class="bg-muted flex-1 rounded p-2 font-mono text-sm">{newlyCreatedKey}</code>
					<Button variant="outline" size="sm" onclick={() => copyKey(newlyCreatedKey!)}>
						<CopyIcon class="size-4" />
					</Button>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="mt-2"
					onclick={() => (newlyCreatedKey = null)}
				>
					Dismiss
				</Button>
			</div>
		{/if}

		<!-- List of keys -->
		{#if data.keys.length === 0}
			<p class="text-muted-foreground text-center text-sm">No API keys yet.</p>
		{:else}
			<div class="space-y-3">
				{#each data.keys as key (key.id)}
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<div>
							<p class="font-medium">{key.name}</p>
							<p class="text-muted-foreground text-xs">
								Created: {formatDate(key.createdAt)} • Last used: {formatDate(key.lastUsedAt)}
							</p>
						</div>
						<Button variant="ghost" size="sm" onclick={() => deleteKey(key.id)}>
							<TrashIcon class="size-4 text-red-500" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- Usage example -->
<Card.Root class="mt-4">
	<Card.Header>
		<Card.Title>Usage Example</Card.Title>
	</Card.Header>
	<Card.Content>
		<pre class="bg-muted overflow-x-auto rounded-lg p-4 text-sm"><code>curl -X POST https://your-domain.com/api/generate-message \
  -H "Authorization: Bearer nc_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{'{'}
    "message": "Hello!",
    "model_id": "gpt-4o"
  {'}'}'</code></pre>
	</Card.Content>
</Card.Root>
