<script lang="ts">
	import { sanitizeHtml } from '$lib/utils/html-sanitizer';
	import { Markdown } from '$lib/utils/markdown.svelte';

	// Copy-button clicks are handled once, by the delegated listener on the message
	// wrapper in message.svelte. This component used to attach its own as well, which
	// meant a single click ran the clipboard write on every ancestor that had one.

	type Props = {
		content: string;
	};

	let { content }: Props = $props();

	const markdown = new Markdown(() => content);
</script>

<div>
	{@html sanitizeHtml(markdown.current ?? '')}
</div>
