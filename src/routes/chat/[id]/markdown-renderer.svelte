<script lang="ts">
	import { sanitizeHtml } from '$lib/utils/markdown-it';
	import { Markdown } from '$lib/utils/markdown.svelte';

	function handleRenderedContentClick(event: MouseEvent) {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const button = target.closest<HTMLButtonElement>(
			'button.copy[data-code], button[data-copy-button][data-code]'
		);
		if (!button) return;

		event.preventDefault();

		const code = button.dataset.code;
		if (!code) return;

		void navigator.clipboard.writeText(code).then(() => {
			button.classList.add('copied');
			setTimeout(() => button.classList.remove('copied'), 3000);
		});
	}

	type Props = {
		content: string;
	};

	let { content }: Props = $props();
	let container: HTMLDivElement | null = $state(null);

	const markdown = new Markdown(() => content);

	$effect(() => {
		if (!container) return;
		container.addEventListener('click', handleRenderedContentClick);

		return () => {
			container?.removeEventListener('click', handleRenderedContentClick);
		};
	});
</script>

<div bind:this={container}>
	{@html sanitizeHtml(markdown.current ?? '')}
</div>
