<script lang="ts">
	import { api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Button } from '$lib/components/ui/button';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { callModal } from '$lib/components/ui/modal/global-modal.svelte';
	import FoldIcon from '~icons/lucide/fold-vertical';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';

	let { conversationId }: { conversationId: string } = $props();

	let busy = $state(false);

	async function compact() {
		const choice = await callModal({
			title: 'Compact Conversation',
			description:
				'Summarize everything except the last exchange so the chat uses less of the model’s context. The summary replaces the older messages in future prompts; the messages themselves stay visible.',
			actions: { cancel: 'outline', compact: 'default' },
		});
		if (choice !== 'compact') return;

		busy = true;
		try {
			const result = await mutate<{ compacted: boolean }>(api.conversations.compact.url, {
				action: 'compact',
				conversationId,
			});
			invalidateQueryPattern(api.conversations.get.url);
			if (!result.compacted) {
				await callModal({
					title: 'Nothing to compact',
					description: 'The conversation is too short to summarize.',
					actions: { ok: 'default' },
				});
			}
		} catch (e) {
			await callModal({
				title: 'Compaction failed',
				description: e instanceof Error ? e.message : 'Unknown error',
				actions: { ok: 'default' },
			});
		} finally {
			busy = false;
		}
	}
</script>

<Tooltip>
	{#snippet trigger(tooltip)}
		<Button
			variant="ghost"
			size="icon"
			class="size-8"
			onclick={compact}
			disabled={busy}
			{...tooltip.trigger}
		>
			{#if busy}
				<LoaderCircleIcon class="!size-4 animate-spin" />
			{:else}
				<FoldIcon class="!size-4" />
			{/if}
			<span class="sr-only">Compact conversation</span>
		</Button>
	{/snippet}
	Compact conversation
</Tooltip>
