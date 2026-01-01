<script lang="ts">
	import { mutate } from '$lib/client/mutation.svelte';
	import { api, invalidateQueryPattern } from '$lib/cache/cached-query.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Modal from '$lib/components/ui/modal/modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import Label from '$lib/components/ui/label/label.svelte';
	import type { Project, ProjectFile, ProjectMember } from '$lib/api';
	import LoaderCircleIcon from '~icons/lucide/loader-circle';
	import TrashIcon from '~icons/lucide/trash';
	import UploadIcon from '~icons/lucide/upload';
	import UserIcon from '~icons/lucide/user';
	import FileTextIcon from '~icons/lucide/file-text';
	import XIcon from '~icons/lucide/x';

	// Helper for checking file type
	function isFile(value: any): value is File {
		return value instanceof File;
	}

	let { open = $bindable(false), project = $bindable<Project | null>(null) } = $props();

	let activeTab = $state<'general' | 'files' | 'members'>('general');
	let loading = $state(false);

	// General Tab State
	let name = $state('');
	let description = $state('');
	let systemPrompt = $state('');

	// Files Tab State
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let projectFiles = $state<ProjectFile[]>([]);
	let loadingFiles = $state(false);

	// Members Tab State
	let inviteUsername = $state('');
	let inviting = $state(false);
	let projectMembers = $state<
		(ProjectMember & { user?: { id: string; name: string | null; email: string } })[]
	>([]);
	let loadingMembers = $state(false);

	async function fetchFiles() {
		if (!project) return;
		loadingFiles = true;
		try {
			const res = await fetch(`${api.projects.list.url}/${project.id}/files`);
			if (res.ok) {
				projectFiles = await res.json();
			}
		} catch (e) {
			console.error('Failed to fetch files', e);
		} finally {
			loadingFiles = false;
		}
	}

	async function fetchMembers() {
		if (!project) return;
		loadingMembers = true;
		try {
			const res = await fetch(`${api.projects.list.url}/${project.id}/members`);
			if (res.ok) {
				projectMembers = await res.json();
			}
		} catch (e) {
			console.error('Failed to fetch members', e);
		} finally {
			loadingMembers = false;
		}
	}

	$effect(() => {
		if (project) {
			if (activeTab === 'general' || open) {
				name = project.name;
				description = project.description || '';
				systemPrompt = project.systemPrompt || '';
			}

			if (open) {
				if (activeTab === 'files') fetchFiles();
				if (activeTab === 'members') fetchMembers();
			}
		}
	});

	async function handleUpdateProject() {
		if (!project) return;
		loading = true;
		try {
			await mutate(`${api.projects.list.url}/${project.id}`, {
				action: 'update',
				name,
				description,
				systemPrompt,
			});
			invalidateQueryPattern(api.projects.list.url);
			open = false;
		} catch (e) {
			console.error('Failed to update project', e);
		} finally {
			loading = false;
		}
	}

	async function handleDeleteProject() {
		if (
			!project ||
			!confirm('Are you sure you want to delete this project? All chats and files will be deleted.')
		)
			return;
		loading = true;
		try {
			await mutate(`${api.projects.list.url}/${project.id}`, { method: 'DELETE' });
			invalidateQueryPattern(api.projects.list.url);
			open = false;
		} catch (e) {
			console.error('Failed to delete project', e);
		} finally {
			loading = false;
		}
	}

	async function handleFileUpload() {
		if (!project || !fileInput?.files?.length) return;
		uploading = true;
		const formData = new FormData();
		const file = fileInput.files[0];
		if (!isFile(file)) return;

		formData.append('file', file);

		try {
			await fetch(`${api.projects.list.url}/${project.id}/files`, {
				method: 'POST',
				body: formData,
			});
			await fetchFiles();
			if (fileInput) fileInput.value = '';
		} catch (e) {
			console.error('Failed to upload file', e);
		} finally {
			uploading = false;
		}
	}

	async function handleDeleteFile(fileId: string) {
		if (!project) return;
		if (!confirm('Delete this file?')) return;
		try {
			await mutate(`${api.projects.list.url}/${project.id}/files?fileId=${fileId}`, {
				method: 'DELETE',
			});
			await fetchFiles();
		} catch (e) {
			console.error('Failed to delete file', e);
		}
	}

	async function handleInviteMember() {
		if (!project || !inviteUsername) return;
		inviting = true;
		const email = `${inviteUsername.trim()}@thom.chat`;
		try {
			await mutate(`${api.projects.list.url}/${project.id}/members`, {
				email,
				role: 'editor', // Default to editor
			});
			await fetchMembers();
			inviteUsername = '';
		} catch (e) {
			console.error('Failed to invite member', e);
			alert('Failed to invite member. Make sure the user exists.');
		} finally {
			inviting = false;
		}
	}

	async function handleRemoveMember(userId: string) {
		if (!project) return;
		if (!confirm('Remove this member?')) return;
		try {
			await mutate(`${api.projects.list.url}/${project.id}/members?userId=${userId}`, {
				method: 'DELETE',
			});
			await fetchMembers();
		} catch (e) {
			console.error('Failed to remove member', e);
		}
	}
</script>

<Modal bind:open>
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-lg font-bold">Project Settings</h3>
		<div class="flex gap-2">
			{#each ['general', 'files', 'members'] as tab}
				<button
					class={`rounded-full px-3 py-1 text-sm capitalize ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
					onclick={() => (activeTab = tab as any)}
				>
					{tab}
				</button>
			{/each}
		</div>
	</div>

	{#if activeTab === 'general'}
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label>Project Name</Label>
				<Input bind:value={name} placeholder="Name" />
			</div>
			<div class="flex flex-col gap-2">
				<Label>Description</Label>
				<Input bind:value={description} placeholder="Description" />
			</div>
			<div class="flex flex-col gap-2">
				<Label>Custom Instructions</Label>
				<Textarea
					bind:value={systemPrompt}
					rows={6}
					placeholder="System prompt for all chats in this project..."
				/>
			</div>
			<div class="mt-4 flex justify-between">
				<Button variant="destructive" onclick={handleDeleteProject} disabled={loading}>
					<TrashIcon class="mr-2 size-4" /> Delete Project
				</Button>
				<Button onclick={handleUpdateProject} disabled={loading}>
					{loading ? 'Saving...' : 'Save Changes'}
				</Button>
			</div>
		</div>
	{:else if activeTab === 'files'}
		<div class="flex flex-col gap-4">
			<div class="flex items-center gap-2">
				<input
					type="file"
					accept=".pdf,.txt,.md,.epub"
					bind:this={fileInput}
					class="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full cursor-pointer rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<Button onclick={handleFileUpload} disabled={uploading}>
					{#if uploading}
						<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
					{:else}
						<UploadIcon class="mr-2 size-4" />
					{/if}
					Upload
				</Button>
			</div>

			<div class="mt-2 flex max-h-[300px] flex-col gap-2 overflow-y-auto">
				{#if loadingFiles}
					<div class="flex justify-center p-4">
						<LoaderCircleIcon class="text-muted-foreground size-6 animate-spin" />
					</div>
				{:else if projectFiles.length === 0}
					<div class="text-muted-foreground p-4 text-center text-sm italic">
						No files uploaded. Files uploaded here will be available as context for all project
						chats.
					</div>
				{:else}
					{#each projectFiles as file}
						<div class="bg-muted/20 flex items-center justify-between rounded border p-2">
							<div class="flex items-center gap-2 overflow-hidden">
								<FileTextIcon class="text-primary size-4 shrink-0" />
								<span class="truncate text-sm font-medium">{file.fileName}</span>
								<span class="text-muted-foreground text-xs uppercase">({file.fileType})</span>
							</div>
							<button
								class="text-muted-foreground p-1 hover:text-red-500"
								onclick={() => handleDeleteFile(file.id)}
							>
								<XIcon class="size-4" />
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{:else if activeTab === 'members'}
		<div class="flex flex-col gap-4">
			<div class="flex items-center gap-2">
				<Input bind:value={inviteUsername} placeholder="Username" />
				<Button onclick={handleInviteMember} disabled={inviting || !inviteUsername}>
					{inviting ? 'Inviting...' : 'Invite'}
				</Button>
			</div>

			<div class="mt-2 flex flex-col gap-2">
				{#if loadingMembers}
					<div class="flex justify-center p-4">
						<LoaderCircleIcon class="text-muted-foreground size-6 animate-spin" />
					</div>
				{:else}
					{#each projectMembers as member}
						<div class="bg-muted/20 flex items-center justify-between rounded border p-2">
							<div class="flex items-center gap-2">
								<UserIcon class="text-primary size-4" />
								<div class="flex flex-col">
									<span class="text-sm font-medium"
										>{member.user?.name || member.user?.email || member.userId}</span
									>
									<span class="text-muted-foreground text-xs capitalize">{member.role}</span>
								</div>
							</div>
							{#if member.role !== 'owner'}
								<button
									class="text-muted-foreground p-1 hover:text-red-500"
									onclick={() => handleRemoveMember(member.userId)}
								>
									<XIcon class="size-4" />
								</button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</Modal>
