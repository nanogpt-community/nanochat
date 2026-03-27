<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/backend/auth/client';
	import { Button } from '$lib/components/ui/button';
	import {
		Root as Card,
		Content as CardContent,
		Description as CardDescription,
		Header as CardHeader,
		Title as CardTitle
	} from '$lib/components/ui/card';
	import Loader2 from '~icons/lucide/loader-2';
	import Plus from '~icons/lucide/plus';
	import Trash2 from '~icons/lucide/trash-2';
	import { toast } from 'svelte-sonner';
	
	interface Props {
		passkeys: {
			id: string;
			name: string | null;
			createdAt: Date | null;
		}[];
	}

	let { passkeys }: Props = $props();

	let isLoading = $state(false);

	function getErrorMessage(error: { message?: unknown } | null | undefined, fallback: string) {
		return typeof error?.message === 'string' ? error.message : fallback;
	}

	async function addPasskey() {
		console.log('[Passkey] addPasskey called');
		isLoading = true;
		try {
			console.log('[Passkey] Calling authClient.passkey.addPasskey()...');
			const result = await authClient.passkey.addPasskey();
			console.log('[Passkey] Result:', result);
			if (result?.error) {
				console.error('[Passkey] Error:', result.error);
				toast.error(getErrorMessage(result.error, 'Failed to add passkey'));
			} else {
				console.log('[Passkey] Success!');
				toast.success('Passkey added successfully');
				await invalidateAll();
			}
		} catch (e: any) {
			console.error('[Passkey] Exception:', e);
			toast.error(e.message || 'Failed to add passkey');
		} finally {
			isLoading = false;
		}
	}

	async function deletePasskey(id: string) {
		if (!confirm('Are you sure you want to delete this passkey?')) return;
		isLoading = true;
		try {
            // @ts-ignore
			const result = await authClient.passkey.deletePasskey(id);
             // @ts-ignore
			if (result?.error) {
                 // @ts-ignore
				toast.error(getErrorMessage(result.error, 'Failed to delete passkey'));
			} else {
				toast.success('Passkey deleted successfully');
				await invalidateAll();
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete passkey');
		} finally {
			isLoading = false;
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Passkeys</CardTitle>
		<CardDescription>
			Manage your passkeys for passwordless login.
		</CardDescription>
	</CardHeader>
	<CardContent class="grid gap-4">
		{#if passkeys.length === 0}
			<div class="text-muted-foreground text-sm text-center py-4">
				No passkeys added yet.
			</div>
		{:else}
			<div class="grid gap-2">
				{#each passkeys as key}
					<div class="flex items-center justify-between rounded-lg border p-3">
						<div class="flex flex-col">
							<span class="font-medium">{key.name || 'Unnamed Passkey'}</span>
							<span class="text-muted-foreground text-xs">
								Added on {key.createdAt ? new Date(key.createdAt).toLocaleDateString() : 'Unknown date'}
							</span>
						</div>
						<Button
							variant="ghost"
							size="icon"
							disabled={isLoading}
							onclick={() => deletePasskey(key.id)}
						>
							<Trash2 class="h-4 w-4" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}

		<Button onclick={addPasskey} disabled={isLoading} class="w-full sm:w-auto">
			{#if isLoading}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
			{:else}
				<Plus class="mr-2 h-4 w-4" />
			{/if}
			Add Passkey
		</Button>
	</CardContent>
</Card>
