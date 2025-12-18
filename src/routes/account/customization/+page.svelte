<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import PlusIcon from '~icons/lucide/plus';
	import { Collapsible } from 'melt/builders';
	import { slide } from 'svelte/transition';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import XIcon from '~icons/lucide/x';
	import { mutate } from '$lib/client/mutation.svelte';
	import { session } from '$lib/state/session.svelte';
	import { useCachedQuery, api, type QueryResult } from '$lib/cache/cached-query.svelte';
	import type { Doc } from '$lib/db/types';
	import { Input } from '$lib/components/ui/input';
	import Rule from './rule.svelte';

	const newRuleCollapsible = new Collapsible({
		open: false,
	});

	let creatingRule = $state(false);

	const userRulesQuery: QueryResult<Doc<'user_rules'>[]> = useCachedQuery(api.user_rules.all, {});

	async function submitNewRule(e: SubmitEvent) {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const attach = formData.get('attach') as 'always' | 'manual';
		const rule = formData.get('rule') as string;

		if (rule === '' || !rule || ruleNameExists) return;

		creatingRule = true;

		await mutate(api.user_rules.create.url, {
			action: 'create',
			name,
			attach,
			rule,
		});

		newRuleCollapsible.open = false;
		name = '';

		creatingRule = false;
	}

	let name = $state('');

	const ruleNameExists = $derived(userRulesQuery.data?.findIndex((r) => r.name === name) !== -1);
</script>

<svelte:head>
	<title>Customization | not t3.chat</title>
</svelte:head>

<h1 class="text-2xl font-bold">Customization</h1>
<h2 class="text-muted-foreground mt-2 text-sm">Customize your experience with not t3.chat.</h2>

<div class="mt-8 flex flex-col gap-4">
	<div class="flex place-items-center justify-between">
		<h3 class="text-xl font-bold">Rules</h3>
		<Button
			{...newRuleCollapsible.trigger}
			variant={newRuleCollapsible.open ? 'outline' : 'default'}
		>
			{#if newRuleCollapsible.open}
				<XIcon class="size-4" />
			{:else}
				<PlusIcon class="size-4" />
			{/if}
			{newRuleCollapsible.open ? 'Cancel' : 'New Rule'}
		</Button>
	</div>
	{#if newRuleCollapsible.open}
		<div
			{...newRuleCollapsible.content}
			in:slide={{ duration: 150, axis: 'y' }}
			out:slide={{ duration: 150, axis: 'y' }}
			class="bg-card flex flex-col gap-4 rounded-lg border p-4"
		>
			<div class="flex flex-col gap-1">
				<h3 class="text-lg font-bold">New Rule</h3>
				<p class="text-muted-foreground text-sm">
					Create a new rule to customize the behavior of your AI.
				</p>
			</div>
			<form onsubmit={submitNewRule} class="flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<Label for="name">Name (Used when referencing the rule)</Label>
					<Input
						id="name"
						name="name"
						placeholder="My Rule"
						required
						bind:value={name}
						aria-invalid={ruleNameExists}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="attach">Rule Type</Label>
					<select
						id="attach"
						name="attach"
						class="border-input bg-background h-9 w-fit rounded-md border px-2 pr-6 text-sm"
						required
					>
						<option value="always">Always</option>
						<option value="manual">Manual</option>
					</select>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="rule">Instructions</Label>
					<Textarea id="rule" name="rule" placeholder="How should the AI respond?" required />
				</div>
				<div class="flex justify-end">
					<Button loading={creatingRule} type="submit">Create Rule</Button>
				</div>
			</form>
		</div>
	{/if}
	{#each userRulesQuery.data ?? [] as rule (rule.id)}
		<Rule {rule} allRules={userRulesQuery.data ?? []} />
	{/each}
</div>
