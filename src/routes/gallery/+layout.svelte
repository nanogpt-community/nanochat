<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import AppSidebar from '$lib/components/app-sidebar.svelte';

	let { children } = $props();
	let searchModalOpen = $state(false);
</script>

<Sidebar.Root>
	<AppSidebar bind:searchModalOpen />
	<Sidebar.Inset>
		<div class="mx-auto w-full max-w-7xl px-3 py-6 md:px-6">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Root>
