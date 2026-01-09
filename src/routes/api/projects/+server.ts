import { json, type RequestEvent } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { projects, projectMembers } from '$lib/db/schema';
import { eq, or, and } from 'drizzle-orm';
import { z } from 'zod';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// GET /api/projects - List user's projects (owned + shared)
export async function GET({ request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    // Get projects user owns
    const ownedProjects = await db.query.projects.findMany({
        where: eq(projects.userId, userId),
        with: {
            files: true,
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
        },
        orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
    });

    // Get projects shared with user
    const sharedMemberships = await db.query.projectMembers.findMany({
        where: eq(projectMembers.userId, userId),
        with: {
            project: {
                with: {
                    files: true,
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
                },
            },
        },
    });

    const sharedProjects = sharedMemberships.map((m) => ({
        ...m.project,
        role: m.role,
        isShared: true,
    }));

    // Combine and deduplicate (in case user is both owner and member)
    const allProjects = [
        ...ownedProjects.map((p) => ({ ...p, role: 'owner', isShared: false })),
        ...sharedProjects.filter((sp) => !ownedProjects.find((op) => op.id === sp.id)),
    ];

    return json(allProjects);
}

const createProjectSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    systemPrompt: z.string().max(10000).optional(),
    color: z.string().max(20).optional(),
});

// POST /api/projects - Create new project
export async function POST({ request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = createProjectSchema.safeParse(body);
    if (!result.success) {
        return json({ error: result.error.flatten() }, { status: 400 });
    }

    const { name, description, systemPrompt, color } = result.data;

    const newProject = {
        id: generateId(),
        userId,
        name,
        description: description ?? null,
        systemPrompt: systemPrompt ?? null,
        color: color ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(projects).values(newProject);

    return json(newProject, { status: 201 });
}
