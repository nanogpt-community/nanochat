import { eq } from 'drizzle-orm';
import { json, type RequestEvent } from '@sveltejs/kit';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { db } from '$lib/db';
import { conversations, messages, projectFiles, projects, storage, user } from '$lib/db/schema';

type GallerySource = 'generated_image' | 'message_document' | 'project_file' | 'unlinked';

type MessageFileEntry = {
	url: string;
	storage_id: string;
	fileName?: string;
};

type GalleryUsage = {
	source: GallerySource;
	seenAt: number;
	conversationId?: string;
	conversationTitle?: string;
	projectId?: string;
	projectName?: string;
};

function parseStorageIdFromUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	const match = url.match(/\/api\/storage\/([a-zA-Z0-9_-]+)/);
	return match?.[1] ?? null;
}

function parseMessageAttachments<T>(
	value: T[] | null | undefined,
	getter: (entry: T) => string | null | undefined
): string[] {
	if (!Array.isArray(value)) return [];

	return value
		.map(getter)
		.map((storage_id) => (typeof storage_id === 'string' ? storage_id.trim() : ''))
		.filter(Boolean);
}

function normalizeMimeType(mimeType: string): string {
	return (mimeType || 'application/octet-stream').toLowerCase();
}

export async function GET({ request }: RequestEvent) {
	const userId = await getAuthenticatedUserId(request);

	const [userRow, messageRows, projectRows, storageRows] = await Promise.all([
		db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: {
				image: true,
			},
		}),
		db
			.select({
				conversationId: messages.conversationId,
				conversationTitle: conversations.title,
				messageCreatedAt: messages.createdAt,
				images: messages.images,
				documents: messages.documents,
			})
			.from(messages)
			.innerJoin(conversations, eq(messages.conversationId, conversations.id))
			.where(eq(conversations.userId, userId)),
		db
			.select({
				storageId: projectFiles.storageId,
				projectId: projects.id,
				projectName: projects.name,
				projectCreatedAt: projectFiles.createdAt,
			})
			.from(projectFiles)
			.innerJoin(projects, eq(projectFiles.projectId, projects.id))
			.where(eq(projects.userId, userId)),
		db.query.storage.findMany({
			where: eq(storage.userId, userId),
			orderBy: (storage, { desc }) => [desc(storage.createdAt)],
		}),
	]);

	const usageByStorage = new Map<string, GalleryUsage>();
	const profileImageStorageId = parseStorageIdFromUrl(userRow?.image);

	const setUsage = (
		storageId: string,
		usage: Omit<GalleryUsage, 'seenAt'> & { seenAt?: number }
	) => {
		const existing = usageByStorage.get(storageId);
		const next = { ...usage, seenAt: usage.seenAt ?? Date.now() };

		if (!existing || next.seenAt > existing.seenAt) {
			usageByStorage.set(storageId, next);
		}
	};

	for (const row of messageRows) {
		const seenAt = row.messageCreatedAt ? new Date(row.messageCreatedAt).getTime() : Date.now();

		for (const storageId of parseMessageAttachments<MessageFileEntry>(
			row.images,
			(item) => item.storage_id
		)) {
			setUsage(storageId, {
				source: 'generated_image',
				conversationId: row.conversationId,
				conversationTitle: row.conversationTitle,
				seenAt,
			});
		}

		for (const storageId of parseMessageAttachments<MessageFileEntry>(
			row.documents,
			(item) => item.storage_id
		)) {
			setUsage(storageId, {
				source: 'message_document',
				conversationId: row.conversationId,
				conversationTitle: row.conversationTitle,
				seenAt,
			});
		}
	}

	for (const row of projectRows) {
		const seenAt = row.projectCreatedAt ? new Date(row.projectCreatedAt).getTime() : Date.now();
		setUsage(row.storageId, {
			source: 'project_file',
			projectId: row.projectId,
			projectName: row.projectName,
			seenAt,
		});
	}

	const files = storageRows
		.filter((item) => item.id !== profileImageStorageId)
		.map((item) => {
			const usage = usageByStorage.get(item.id);
			return {
				id: item.id,
				filename: item.filename,
				mimeType: normalizeMimeType(item.mimeType),
				size: item.size,
				createdAt: new Date(item.createdAt).toISOString(),
				url: `/api/storage/${item.id}`,
				source: usage?.source ?? 'unlinked',
				conversationId: usage?.conversationId,
				conversationTitle: usage?.conversationTitle,
				projectId: usage?.projectId,
				projectName: usage?.projectName,
			};
		});
	return json(files);
}
