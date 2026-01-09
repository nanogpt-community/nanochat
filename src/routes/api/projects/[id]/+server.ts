import { json, type RequestEvent } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { projects, projectMembers, conversations, projectFiles } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { z } from 'zod';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// Helper to check if user has access to project
async function getUserProjectAccess(
    projectId: string,
    userId: string
): Promise<{ project: typeof projects.$inferSelect; role: string } | null> {
    // Check if user owns the project
    const ownedProject = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (ownedProject) {
        return { project: ownedProject, role: 'owner' };
    }

    // Check if user is a member
    const membership = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
        with: { project: true },
    });

    if (membership) {
        return { project: membership.project, role: membership.role };
    }

    return null;
}

// GET /api/projects/[id] - Get single project with all details
export async function GET({ params, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    if (!projectId) {
        return json({ error: 'Project ID required' }, { status: 400 });
    }

    const access = await getUserProjectAccess(projectId, userId);
    if (!access) {
        return json({ error: 'Project not found' }, { status: 404 });
    }

    // Get full project details
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        with: {
            files: {
                with: {
                    storage: true,
                },
            },
            members: {
                with: {
                    user: {
                        columns: {
                            id: true,
                            name: true,
                            email: true,
                            image: true,
                        },
                    },
                },
            },
            conversations: {
                orderBy: (conversations, { desc }) => [desc(conversations.updatedAt)],
            },
        },
    });

    return json({ ...project, role: access.role });
}

const updateProjectSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).optional().nullable(),
    systemPrompt: z.string().max(10000).optional().nullable(),
    color: z.string().max(20).optional().nullable(),
});

// PATCH /api/projects/[id] - Update project
export async function PATCH({ params, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    if (!projectId) {
        return json({ error: 'Project ID required' }, { status: 400 });
    }

    const access = await getUserProjectAccess(projectId, userId);
    if (!access) {
        return json({ error: 'Project not found' }, { status: 404 });
    }

    // Only owner and editor can update
    if (access.role === 'viewer') {
        return json({ error: 'Permission denied' }, { status: 403 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = updateProjectSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const updates = {
        ...result.data,
        updatedAt: new Date(),
    };

    await db.update(projects).set(updates).where(eq(projects.id, projectId));

    const updated = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
    });

    return json(updated);
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE({ params, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    if (!projectId) {
        return json({ error: 'Project ID required' }, { status: 400 });
    }

    // Only owner can delete
    const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
        return json({ error: 'Project not found or permission denied' }, { status: 404 });
    }

    // Unassign conversations from project (set projectId to null)
    await db
        .update(conversations)
        .set({ projectId: null, updatedAt: new Date() })
        .where(eq(conversations.projectId, projectId));

    // Delete the project (cascade will delete files and members)
    await db.delete(projects).where(eq(projects.id, projectId));

    return json({ success: true });
}
