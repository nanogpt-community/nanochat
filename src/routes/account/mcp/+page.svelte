<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import PlugIcon from '~icons/lucide/plug';
	import TrashIcon from '~icons/lucide/trash-2';
	import { ResultAsync } from 'neverthrow';
	import { session } from '$lib/state/session.svelte.js';
	import { parseHeaderLines } from '$lib/utils/http-headers';
	import type { McpServerConfig } from '$lib/api';

	const servers = useCachedQuery<McpServerConfig[]>(api.mcp_servers.list, {
		cache_scope: session.current?.user.id ?? 'anonymous',
	});

	let name = $state('');
	let url = $state('');
	let authToken = $state('');
	let headerText = $state('');
	let busy = $state(false);
	let message = $state<{ text: string; ok: boolean } | null>(null);

	const parsedHeaders = $derived(parseHeaderLines(headerText));

	const invalidate = { invalidatePatterns: [api.mcp_servers.list.url] };

	async function run<T>(fn: () => Promise<T>, okText?: string) {
		busy = true;
		message = null;
		const res = await ResultAsync.fromPromise(fn(), (e) => e);
		busy = false;

		if (res.isErr()) {
			message = { text: String((res.error as Error)?.message ?? res.error), ok: false };
			return null;
		}
		if (okText) message = { text: okText, ok: true };
		return res.value;
	}

	async function test() {
		if (parsedHeaders.errors.length) {
			message = { text: parsedHeaders.errors.join('; '), ok: false };
			return;
		}
		const res = await run(() =>
			mutate<{ ok: boolean; tools?: string[]; error?: string }>(api.mcp_servers.save.url, {
				action: 'test',
				url,
				authToken: authToken || undefined,
				headers: parsedHeaders.headers,
			})
		);
		if (!res) return;
		message = res.ok
			? {
					text: `Connected — ${res.tools?.length ?? 0} tool(s): ${res.tools?.join(', ')}`,
					ok: true,
				}
			: { text: res.error ?? 'Connection failed', ok: false };
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (parsedHeaders.errors.length) {
			message = { text: parsedHeaders.errors.join('; '), ok: false };
			return;
		}

		const added = await run(
			() =>
				mutate(
					api.mcp_servers.save.url,
					{
						name: name.trim(),
						url: url.trim(),
						authToken: authToken || undefined,
						headers: parsedHeaders.headers,
					},
					invalidate
				),
			'Server added'
		);
		if (added) {
			name = '';
			url = '';
			authToken = '';
			headerText = '';
		}
	}

	async function toggle(server: McpServerConfig, enabled: boolean) {
		const previous = server.enabled;
		server.enabled = enabled; // optimistic, so the switch doesn't snap back mid-refetch

		const res = await run(() =>
			mutate(api.mcp_servers.save.url, { action: 'update', id: server.id, enabled }, invalidate)
		);

		if (!res) server.enabled = previous;
	}

	function remove(server: McpServerConfig) {
		if (!confirm(`Remove "${server.name}"?`)) return;
		return run(
			() =>
				mutate(
					`${api.mcp_servers.remove.url}?id=${encodeURIComponent(server.id)}`,
					{ method: 'DELETE' },
					invalidate
				),
			'Server removed'
		);
	}
</script>

<svelte:head>
	<title>MCP Servers | nanochat</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-bold tracking-tight">MCP Servers</h1>
	<p class="text-muted-foreground text-sm">
		Connect remote Model Context Protocol servers. Their tools become available to the model in
		every chat.
	</p>
</div>

<div class="mt-6 flex flex-col gap-4">
	{#if servers.isLoading}
		<div class="bg-card h-20 animate-pulse rounded-lg"></div>
	{:else if servers.error}
		<p class="text-destructive text-sm">
			Could not load your MCP servers: {servers.error.message}
		</p>
	{:else}
		{#each servers.data ?? [] as server (server.id)}
			<div class="bg-card border-border flex items-center gap-3 rounded-lg border p-4">
				<div
					class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md"
				>
					<PlugIcon class="size-4" />
				</div>
				<div class="flex min-w-0 flex-col">
					<span class="truncate font-medium">{server.name}</span>
					<span class="text-muted-foreground truncate text-xs">
						{server.url}{server.hasAuthToken ? ' · authenticated' : ''}{server.headerNames?.length
							? ` · ${server.headerNames.join(', ')}`
							: ''}
					</span>
				</div>
				<div class="ml-auto flex shrink-0 items-center gap-3">
					<Switch bind:value={() => server.enabled, (v) => toggle(server, v)} />
					<Button variant="ghost" size="sm" onclick={() => remove(server)} aria-label="Remove">
						<TrashIcon class="size-4" />
					</Button>
				</div>
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">No MCP servers yet.</p>
		{/each}
	{/if}

	<form onsubmit={add} class="bg-card border-border flex flex-col gap-3 rounded-lg border p-5">
		<h2 class="font-medium">Add a server</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			<Input bind:value={name} placeholder="Name (e.g. linear)" autocomplete="off" />
			<Input bind:value={url} placeholder="https://mcp.example.com/mcp" autocomplete="off" />
		</div>
		<Input
			bind:value={authToken}
			type="password"
			placeholder="Bearer token (optional)"
			autocomplete="off"
		/>
		<div class="flex flex-col gap-1">
			<Textarea
				bind:value={headerText}
				rows={3}
				spellcheck="false"
				placeholder={'Extra headers, one per line (optional)\nX-Api-Key: abc123'}
				class="font-mono text-xs"
			/>
			{#if headerText.trim() && parsedHeaders.errors.length}
				<p class="text-destructive text-xs">{parsedHeaders.errors.join('; ')}</p>
			{/if}
		</div>
		{#if message}
			<p class={message.ok ? 'text-xs text-green-600' : 'text-destructive text-xs'}>
				{message.text}
			</p>
		{/if}
		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={!url.trim() || busy}
				onclick={test}
			>
				Test connection
			</Button>
			<Button type="submit" size="sm" loading={busy} disabled={!name.trim() || !url.trim()}>
				Add server
			</Button>
		</div>
	</form>
</div>
