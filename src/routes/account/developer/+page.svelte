<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import KeyIcon from '~icons/lucide/key';
	import PlusIcon from '~icons/lucide/plus';
	import TrashIcon from '~icons/lucide/trash-2';
	import CopyIcon from '~icons/lucide/copy';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const API_DOCS_URL = 'https://github.com/nanogpt-community/nanochat/blob/main/api-docs.md';

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

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-bold tracking-tight">Developer</h1>
	<p class="text-muted-foreground text-sm">
		Personal Access Tokens for API authentication. Use these keys with the
		<code class="bg-muted rounded px-1 text-xs">Authorization: Bearer &lt;KEY&gt;</code> header.
	</p>
	<a
		href={API_DOCS_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="text-primary hover:text-primary/80 mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
	>
		View API Documentation
		<ExternalLinkIcon class="size-4" />
	</a>
</div>

<div class="mt-6 flex flex-col gap-6">
	<!-- API Keys section -->
	<section class="flex flex-col gap-3">
		<div class="flex flex-col gap-0.5">
			<h3 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
				Personal Access Tokens
			</h3>
			<p class="text-muted-foreground text-xs">Generate and manage your personal access tokens.</p>
		</div>

		<div class="bg-card border-border flex flex-col gap-4 rounded-lg border p-5">
			<div class="flex gap-2">
				<Input bind:value={newKeyName} placeholder="Key name (e.g., CLI Script)" class="flex-1" />
				<Button onclick={createKey} disabled={creating || !newKeyName.trim()}>
					<PlusIcon class="mr-1 size-4" />
					Generate Key
				</Button>
			</div>

			{#if newlyCreatedKey}
				<div class="rounded-lg border border-green-500/40 bg-green-500/10 p-4">
					<p class="mb-2 text-sm font-medium text-green-700 dark:text-green-300">
						Key created! Copy it now — you won't be able to see it again.
					</p>
					<div class="flex items-center gap-2">
						<code class="bg-muted flex-1 rounded p-2 font-mono text-sm break-all">
							{newlyCreatedKey}
						</code>
						<Button variant="outline" size="sm" onclick={() => copyKey(newlyCreatedKey!)}>
							<CopyIcon class="size-4" />
						</Button>
					</div>
					<Button variant="ghost" size="sm" class="mt-2" onclick={() => (newlyCreatedKey = null)}>
						Dismiss
					</Button>
				</div>
			{/if}

			{#if data.keys.length === 0}
				<div class="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
					<KeyIcon class="size-8 opacity-40" />
					<p class="text-sm">No API keys yet.</p>
				</div>
			{:else}
				<div class="divide-border border-border divide-y rounded-lg border">
					{#each data.keys as key (key.id)}
						<div class="flex items-center justify-between gap-4 p-4">
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{key.name}</p>
								<p class="text-muted-foreground text-xs">
									Created {formatDate(key.createdAt)} · Last used {formatDate(key.lastUsedAt)}
								</p>
							</div>
							<Button variant="ghost" size="sm" onclick={() => deleteKey(key.id)}>
								<TrashIcon class="size-4 text-red-500" />
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Usage example -->
	<section class="flex flex-col gap-3">
		<div class="flex flex-col gap-0.5">
			<h3 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
				Usage Example
			</h3>
		</div>
		<pre class="bg-card border-border overflow-x-auto rounded-lg border p-4 text-sm"><code
				>curl -X POST https://your-domain.com/api/generate-message \
  -H "Authorization: Bearer nc_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{'{'}
    "message": "Hello!",
    "model_id": "gpt-4o"
  {'}'}'</code
			></pre>
	</section>
</div>
