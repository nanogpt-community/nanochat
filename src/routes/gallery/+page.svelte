<script lang="ts">
	import { useCachedQuery, api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import ImageIcon from '~icons/lucide/image';
	import FileTextIcon from '~icons/lucide/file-text';
	import FolderIcon from '~icons/lucide/folder';
	import Trash2Icon from '~icons/lucide/trash-2';
	import ExternalLinkIcon from '~icons/lucide/external-link';
	import ChatBubbleIcon from '~icons/lucide/message-square';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';

	type GalleryFile = {
		id: string;
		filename: string;
		mimeType: string;
		size: number;
		createdAt: string;
		url: string;
		source: 'generated_image' | 'message_document' | 'project_file' | 'unlinked';
		conversationId?: string | null;
		conversationTitle?: string | null;
		projectId?: string | null;
		projectName?: string | null;
	};

	type GalleryFilter = 'all' | 'images' | 'documents' | 'project_files' | 'other';

	const galleryQuery = useCachedQuery<GalleryFile[]>(api.storage.gallery, {
		session_token: session.current?.session.token ?? '',
	});

	let deletingFileIds = $state<string[]>([]);
	let activeFilter = $state<GalleryFilter>('all');

	const filters = [
		{ id: 'all', label: 'All' },
		{ id: 'images', label: 'Images' },
		{ id: 'documents', label: 'Documents' },
		{ id: 'project_files', label: 'Project Files' },
		{ id: 'other', label: 'Other' },
	] satisfies { id: GalleryFilter; label: string }[];

	const filteredFiles = $derived.by<GalleryFile[]>(() => {
		const files = galleryQuery.data ?? [];

		switch (activeFilter) {
			case 'images':
				return files.filter((file) => file.mimeType.startsWith('image/'));
			case 'documents':
				return files.filter((file) =>
					['application/pdf', 'text/markdown', 'text/plain', 'application/epub+zip'].includes(
						file.mimeType
					)
				);
			case 'project_files':
				return files.filter((file) => file.source === 'project_file');
			case 'other':
				return files.filter((file) => file.source === 'unlinked');
			default:
				return files;
		}
	});

	function isImage(file: GalleryFile) {
		return file.mimeType.startsWith('image/');
	}

	function sourceLabel(file: GalleryFile) {
		if (file.source === 'generated_image') return 'Generated image';
		if (file.source === 'message_document') return 'Chat document';
		if (file.source === 'project_file') return 'Project file';
		return 'Attachment';
	}

	function formatBytes(size: number) {
		if (size <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = size;
		let unitIndex = 0;

		while (value >= 1024 && unitIndex < units.length - 1) {
			value = value / 1024;
			unitIndex += 1;
		}

		return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function formatDate(isoDate: string) {
		const date = new Date(isoDate);
		if (Number.isNaN(date.getTime())) return 'Unknown date';
		return date.toLocaleString();
	}

	function openChat(conversationId: string | null | undefined) {
		if (!conversationId) return;
		goto(`/chat/${conversationId}`);
	}

	function isDeleting(fileId: string) {
		return deletingFileIds.includes(fileId);
	}

	function refreshGallery() {
		invalidateQueryPattern(api.storage.gallery.url);
	}

	async function deleteFile(file: GalleryFile) {
		const confirmed = confirm(
			`Delete "${file.filename}"? This will permanently remove the file and cannot be undone.`
		);
		if (!confirmed) return;

		deletingFileIds = [...new Set([...deletingFileIds, file.id])];

		try {
			const response = await fetch(`/api/storage?id=${encodeURIComponent(file.id)}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText || `Failed to delete file (${response.status})`);
			}

			refreshGallery();
		} catch (e) {
			console.error('Failed to delete file:', e);
		} finally {
			deletingFileIds = deletingFileIds.filter((id) => id !== file.id);
		}
	}
</script>

<div class="space-y-5">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold">My Stuff</h1>
		<p class="text-muted-foreground text-sm">
			All files generated or attached in your chats, pulled into one place.
		</p>
	</div>

	<div class="flex flex-wrap gap-2">
		{#each filters as filter (filter.id)}
			<Button
				variant={activeFilter === filter.id ? 'default' : 'outline'}
				size="sm"
				onclick={() => (activeFilter = filter.id)}
			>
				{filter.label}
			</Button>
		{/each}
		<Button variant="ghost" size="sm" onclick={refreshGallery} class="ml-auto">Refresh</Button>
	</div>

	{#if galleryQuery.isLoading}
		<div
			class="flex items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center"
		>
			<LoaderCircleIcon class="text-muted-foreground size-8 animate-spin" />
		</div>
	{:else if galleryQuery.error}
		<div
			class="border-destructive/30 text-destructive flex flex-col gap-2 rounded-lg border px-4 py-8 text-center text-sm"
		>
			<p>We had trouble loading your files.</p>
			<Button variant="outline" size="sm" onclick={refreshGallery}>Try again</Button>
		</div>
	{:else if filteredFiles.length > 0}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each filteredFiles as file (file.id)}
				<article
					class="border-border bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
				>
					<div class="relative overflow-hidden border-b">
						{#if isImage(file)}
							<img
								src={file.url}
								alt={file.filename}
								class="aspect-video h-full w-full object-cover"
								loading="lazy"
							/>
						{:else}
							<div
								class="bg-muted/50 text-muted-foreground flex aspect-video h-full w-full items-center justify-center"
							>
								{#if file.mimeType.includes('text') || file.mimeType.includes('markdown')}
									<FileTextIcon class="size-10" />
								{:else}
									<FolderIcon class="size-10" />
								{/if}
							</div>
						{/if}
						<span
							class="bg-background/85 text-foreground absolute top-2 right-2 rounded-full px-2 py-1 text-[11px] font-medium tracking-wide uppercase backdrop-blur"
						>
							{sourceLabel(file)}
						</span>
					</div>
					<div class="space-y-2 px-3 py-2">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium" title={file.filename}>{file.filename}</p>
								<p class="text-muted-foreground mt-1 text-xs tracking-wide uppercase">
									{file.mimeType}
								</p>
							</div>
							{#if isImage(file)}
								<ImageIcon class="text-muted-foreground size-5 shrink-0" />
							{:else}
								<FileTextIcon class="text-muted-foreground size-5 shrink-0" />
							{/if}
						</div>
						<div class="text-muted-foreground text-xs">
							<p>{formatDate(file.createdAt)} • {formatBytes(file.size)}</p>
							{#if file.conversationId && file.conversationTitle}
								<p class="mt-1 flex items-center gap-1">
									<ChatBubbleIcon class="size-3" />
									<button
										type="button"
										class="hover:text-foreground text-left underline decoration-dotted underline-offset-2"
										onclick={() => openChat(file.conversationId)}
									>
										From: {file.conversationTitle}
									</button>
								</p>
							{:else if file.projectName}
								<p class="mt-1">Project: {file.projectName}</p>
							{/if}
						</div>
					</div>
					<div class="mt-auto flex flex-wrap gap-2 border-t px-3 py-2">
						<a
							href={file.url}
							target="_blank"
							rel="noreferrer"
							class="bg-secondary/50 hover:bg-secondary text-foreground inline-flex flex-1 min-w-24 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors"
						>
							<ExternalLinkIcon class="size-3.5" />
							Open
						</a>
						{#if file.conversationId}
							<button
								type="button"
								class="hover:bg-accent bg-secondary/50 inline-flex flex-1 min-w-24 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors"
								onclick={() => openChat(file.conversationId)}
							>
								<ChatBubbleIcon class="size-3.5" />
								Conversation
							</button>
						{:else}
							<span
								class="bg-muted/50 text-muted-foreground inline-flex flex-1 min-w-24 items-center justify-center rounded-md px-3 py-2 text-xs"
							>
								No source
							</span>
						{/if}
						<button
							type="button"
							class="bg-destructive/90 hover:bg-destructive inline-flex flex-1 min-w-24 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60"
							onclick={() => deleteFile(file)}
							disabled={isDeleting(file.id)}
						>
							{#if isDeleting(file.id)}
								<LoaderCircleIcon class="size-3.5 animate-spin" />
							{:else}
								<Trash2Icon class="size-3.5" />
								Delete
							{/if}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div
			class="border-border text-muted-foreground flex h-52 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center"
		>
			<ImageIcon class="text-muted-foreground mb-3 size-8" />
			<p class="text-sm">No files to show.</p>
			<p class="mt-1 text-sm">Start a chat and attach files or generate media to see them here.</p>
		</div>
	{/if}
</div>
