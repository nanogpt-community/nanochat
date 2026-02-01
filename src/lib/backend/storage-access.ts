import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';
import { db } from '$lib/db';
import {
	conversations,
	messages,
	projectFiles,
	projectMembers,
	projects,
	storage,
	type Storage,
} from '$lib/db/schema';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';

type StorageAccessResult = {
	storage: Storage;
	isPublic: boolean;
	access: 'owner' | 'project' | 'public';
};

function buildStorageReferencePredicate(storageId: string) {
	const urlNeedle = `/api/storage/${storageId}`;
	const storagePattern = `%\"storage_id\"%${storageId}%`;
	return sql`(
		${messages.images} LIKE ${storagePattern}
		OR ${messages.documents} LIKE ${storagePattern}
		OR ${messages.content} LIKE ${`%${urlNeedle}%`}
		OR ${messages.contentHtml} LIKE ${`%${urlNeedle}%`}
	)`;
}

async function hasProjectAccessViaProjectFiles(storageId: string, userId: string): Promise<boolean> {
	const result = await db
		.select({ id: projectFiles.id })
		.from(projectFiles)
		.innerJoin(projects, eq(projectFiles.projectId, projects.id))
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))
		)
		.where(
			and(
				eq(projectFiles.storageId, storageId),
				or(eq(projects.userId, userId), isNotNull(projectMembers.userId))
			)
		)
		.limit(1);

	return result.length > 0;
}

async function hasProjectAccessViaMessages(storageId: string, userId: string): Promise<boolean> {
	const referencePredicate = buildStorageReferencePredicate(storageId);
	const result = await db
		.select({ id: messages.id })
		.from(messages)
		.innerJoin(conversations, eq(messages.conversationId, conversations.id))
		.innerJoin(projects, eq(conversations.projectId, projects.id))
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))
		)
		.where(
			and(
				isNotNull(conversations.projectId),
				or(eq(projects.userId, userId), isNotNull(projectMembers.userId)),
				referencePredicate
			)
		)
		.limit(1);

	return result.length > 0;
}

async function isStoragePublicViaMessages(storageId: string): Promise<boolean> {
	const referencePredicate = buildStorageReferencePredicate(storageId);
	const result = await db
		.select({ id: messages.id })
		.from(messages)
		.innerJoin(conversations, eq(messages.conversationId, conversations.id))
		.where(and(eq(conversations.public, true), referencePredicate))
		.limit(1);

	return result.length > 0;
}

export async function getStorageAccess(
	storageId: string,
	request: Request
): Promise<StorageAccessResult | null> {
	const storageRecord = await db.query.storage.findFirst({
		where: eq(storage.id, storageId),
	});

	if (!storageRecord) {
		return null;
	}

	const userId = await tryGetAuthenticatedUserId(request);

	if (userId && storageRecord.userId === userId) {
		return { storage: storageRecord, isPublic: false, access: 'owner' };
	}

	if (userId) {
		const projectAccess =
			(await hasProjectAccessViaProjectFiles(storageId, userId)) ||
			(await hasProjectAccessViaMessages(storageId, userId));

		if (projectAccess) {
			return { storage: storageRecord, isPublic: false, access: 'project' };
		}
	}

	const isPublic = await isStoragePublicViaMessages(storageId);
	if (isPublic) {
		return { storage: storageRecord, isPublic: true, access: 'public' };
	}

	return null;
}
