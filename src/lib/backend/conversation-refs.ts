import { db } from '$lib/db';
import { assistants, projectMembers, projects } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Validate the project/assistant a caller wants attached to a new conversation.
 *
 * Both ids arrive straight from the request body. Prompt assembly later trusts the
 * conversation row and splices in the project's system prompt plus the full extracted
 * text of every attached file, so an unvalidated id lets a caller mount someone
 * else's project and read its documents back out of the model's context. The
 * `setProject` action already performed exactly this check; the generation endpoints
 * wrote the same columns without it.
 *
 * Returns the ids to persist, with anything the user may not use dropped to null.
 */
export async function resolveConversationRefs(
	userId: string,
	refs: { projectId?: string | null; assistantId?: string | null }
): Promise<{ projectId: string | null; assistantId: string | null }> {
	const [projectId, assistantId] = await Promise.all([
		refs.projectId ? assertUsableProject(userId, refs.projectId) : null,
		refs.assistantId ? assertUsableAssistant(userId, refs.assistantId) : null,
	]);

	return { projectId, assistantId };
}

async function assertUsableProject(userId: string, projectId: string): Promise<string | null> {
	const owned = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
		columns: { id: true },
	});
	if (owned) return projectId;

	// Shared projects are legitimate: membership is enough, matching `setProject`.
	const membership = await db.query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
		columns: { id: true },
	});

	return membership ? projectId : null;
}

async function assertUsableAssistant(userId: string, assistantId: string): Promise<string | null> {
	const owned = await db.query.assistants.findFirst({
		where: and(eq(assistants.id, assistantId), eq(assistants.userId, userId)),
		columns: { id: true },
	});

	return owned ? assistantId : null;
}
