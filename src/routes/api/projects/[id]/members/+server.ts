import { json, type RequestEvent } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { projects, projectMembers, user } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// Helper to check if user is project owner
async function isProjectOwner(projectId: string, userId: string): Promise<boolean> {
    const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });
    return !!project;
}

// GET /api/projects/[id]/members - List project members
export async function GET({ params, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    if (!projectId) {
        return json({ error: 'Project ID required' }, { status: 400 });
    }

    // Check if user has access (owner or member)
    const isOwner = await isProjectOwner(projectId, userId);
    const isMember = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    });

    if (!isOwner && !isMember) {
        return json({ error: 'Project not found' }, { status: 404 });
    }

    const members = await db.query.projectMembers.findMany({
        where: eq(projectMembers.projectId, projectId),
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
    });

    // Also include the owner
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
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
    });

    const owner = project?.user
        ? {
            id: 'owner',
            userId: project.user.id,
            role: 'owner',
            user: project.user,
        }
        : null;

    return json([...(owner ? [owner] : []), ...members]);
}

const addMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(['editor', 'viewer']).default('viewer'),
});

// POST /api/projects/[id]/members - Add member to project
export async function POST({ params, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    if (!projectId) {
        return json({ error: 'Project ID required' }, { status: 400 });
    }

    // Only owner can add members
    const isOwner = await isProjectOwner(projectId, userId);
    if (!isOwner) {
        return json({ error: 'Permission denied' }, { status: 403 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = addMemberSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const { email, role } = result.data;

    // Find user by email
    const targetUser = await db.query.user.findFirst({
        where: eq(user.email, email),
    });

    if (!targetUser) {
        return json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is already a member
    const existingMember = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUser.id)),
    });

    if (existingMember) {
        return json({ error: 'User is already a member' }, { status: 400 });
    }

    // Can't add the owner as a member
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
    });

    if (project?.userId === targetUser.id) {
        return json({ error: 'Cannot add owner as a member' }, { status: 400 });
    }

    const member = {
        id: generateId(),
        projectId,
        userId: targetUser.id,
        role,
        createdAt: new Date(),
    };

    await db.insert(projectMembers).values(member);

    // Update project's updatedAt
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));

    return json(
        {
            ...member,
            user: {
                id: targetUser.id,
                name: targetUser.name,
                email: targetUser.email,
                image: targetUser.image,
            },
        },
        { status: 201 }
    );
}

// DELETE /api/projects/[id]/members?userId=xxx - Remove member from project
export async function DELETE({ params, url, request }: RequestEvent) {
    const authUserId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    const targetUserId = url.searchParams.get('userId');

    if (!projectId || !targetUserId) {
        return json({ error: 'Project ID and user ID required' }, { status: 400 });
    }

    // Only owner can remove members (or user can remove themselves)
    const isOwner = await isProjectOwner(projectId, authUserId);
    const isSelf = targetUserId === authUserId;

    if (!isOwner && !isSelf) {
        return json({ error: 'Permission denied' }, { status: 403 });
    }

    // Remove member
    await db
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUserId)));

    // Update project's updatedAt
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));

    return json({ success: true });
}
