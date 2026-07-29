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

/**
 * Matches a message that mentions this storage id, in `images`/`documents` metadata
 * or as a URL in the body.
 *
 * SECURITY: message content is attacker-controlled, so a match proves nothing on its
 * own. Every caller must additionally require that the referencing conversation is
 * owned by the file's owner — i.e. that the owner is the one who shared it. Without
 * that link, anyone could post `/api/storage/<victim-file-id>` in their own
 * conversation, publish it, and be granted the victim's file.
 */
function buildStorageReferencePredicate(storageId: string) {
	const urlNeedle = `/api/storage/${storageId}`;
	const storagePattern = `%\"storage_id\"%${storageId}%`;
	return sql`(
		${messages.images}::text LIKE ${storagePattern}
		OR ${messages.documents}::text LIKE ${storagePattern}
		OR ${messages.content} LIKE ${`%${urlNeedle}%`}
		OR ${messages.contentHtml} LIKE ${`%${urlNeedle}%`}
	)`;
}

async function hasProjectAccessViaProjectFiles(
	storageId: string,
	userId: string
): Promise<boolean> {
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

async function hasProjectAccessViaMessages(
	storageId: string,
	userId: string,
	ownerId: string
): Promise<boolean> {
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
				// The reference must come from the owner's own conversation.
				eq(conversations.userId, ownerId),
				or(eq(projects.userId, userId), isNotNull(projectMembers.userId)),
				referencePredicate
			)
		)
		.limit(1);

	return result.length > 0;
}

async function isStoragePublicViaMessages(storageId: string, ownerId: string): Promise<boolean> {
	const referencePredicate = buildStorageReferencePredicate(storageId);
	const result = await db
		.select({ id: messages.id })
		.from(messages)
		.innerJoin(conversations, eq(messages.conversationId, conversations.id))
		.where(
			and(
				eq(conversations.public, true),
				// Only the owner publishing their own file makes it public. This also
				// makes un-sharing actually revoke: a viewer who copied the id cannot
				// re-publish it in a conversation of their own to keep access.
				eq(conversations.userId, ownerId),
				referencePredicate
			)
		)
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
			(await hasProjectAccessViaMessages(storageId, userId, storageRecord.userId));

		if (projectAccess) {
			return { storage: storageRecord, isPublic: false, access: 'project' };
		}
	}

	const isPublic = await isStoragePublicViaMessages(storageId, storageRecord.userId);
	if (isPublic) {
		return { storage: storageRecord, isPublic: true, access: 'public' };
	}

	return null;
}
