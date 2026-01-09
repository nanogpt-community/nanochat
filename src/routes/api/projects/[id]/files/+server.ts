import { json, type RequestEvent } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { projects, projectMembers, projectFiles, storage } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { extractTextFromPDF } from '$lib/utils/pdf-extraction';
import { extractTextFromEPUB } from '$lib/utils/epub-extraction';
import { saveFile } from '$lib/backend/storage';
import path from 'path';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// Helper to check if user has access to project
async function getUserProjectAccess(
    projectId: string,
    userId: string
): Promise<{ role: string } | null> {
    const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (project) {
        return { role: 'owner' };
    }

    const membership = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    });

    if (membership) {
        return { role: membership.role };
    }

    return null;
}

// GET /api/projects/[id]/files - List project files
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

    const files = await db.query.projectFiles.findMany({
        where: eq(projectFiles.projectId, projectId),
        with: {
            storage: true,
        },
        orderBy: (projectFiles, { desc }) => [desc(projectFiles.createdAt)],
    });

    return json(files);
}

// Helper: determine file type from mime type
function getFileType(mimeType: string): 'pdf' | 'markdown' | 'text' | 'epub' | null {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown') return 'markdown';
    if (mimeType === 'text/plain') return 'text';
    if (mimeType === 'application/epub+zip') return 'epub';
    return null;
}

// POST /api/projects/[id]/files - Upload file to project
export async function POST({ params, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    if (!projectId) {
        return json({ error: 'Project ID required' }, { status: 400 });
    }

    const access = await getUserProjectAccess(projectId, userId);
    if (!access) {
        return json({ error: 'Project not found' }, { status: 404 });
    }

    // Only owner and editor can upload files
    if (access.role === 'viewer') {
        return json({ error: 'Permission denied' }, { status: 403 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return json({ error: 'No file provided' }, { status: 400 });
        }

        const fileType = getFileType(file.type);
        if (!fileType) {
            return json(
                { error: 'Unsupported file type. Supported: PDF, Markdown, Text, EPUB' },
                { status: 400 }
            );
        }

        // Save file to storage
        const buffer = Buffer.from(await file.arrayBuffer());
        const savedFile = await saveFile(buffer, file.name, file.type, userId);

        // Extract text content for context
        let extractedContent: string | null = null;
        try {
            if (fileType === 'pdf') {
                extractedContent = await extractTextFromPDF(buffer);
            } else if (fileType === 'epub') {
                extractedContent = await extractTextFromEPUB(buffer);
            } else if (fileType === 'markdown' || fileType === 'text') {
                extractedContent = buffer.toString('utf-8');
            }
        } catch (error) {
            console.error('Failed to extract content:', error);
            // Continue without extracted content
        }

        // Create project file record
        const projectFile = {
            id: generateId(),
            projectId,
            storageId: savedFile.id,
            fileName: file.name,
            fileType,
            extractedContent,
            createdAt: new Date(),
        };

        await db.insert(projectFiles).values(projectFile);

        // Update project's updatedAt
        await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));

        return json(
            {
                ...projectFile,
                storage: savedFile,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('File upload error:', error);
        return json({ error: 'Failed to upload file' }, { status: 500 });
    }
}

// DELETE /api/projects/[id]/files?fileId=xxx - Remove file from project
export async function DELETE({ params, url, request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);

    const projectId = params.id;
    const fileId = url.searchParams.get('fileId');

    if (!projectId || !fileId) {
        return json({ error: 'Project ID and file ID required' }, { status: 400 });
    }

    const access = await getUserProjectAccess(projectId, userId);
    if (!access) {
        return json({ error: 'Project not found' }, { status: 404 });
    }

    // Only owner and editor can delete files
    if (access.role === 'viewer') {
        return json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify file belongs to this project
    const file = await db.query.projectFiles.findFirst({
        where: and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId)),
    });

    if (!file) {
        return json({ error: 'File not found' }, { status: 404 });
    }

    // Delete the project file (storage cleanup can be done separately)
    await db.delete(projectFiles).where(eq(projectFiles.id, fileId));

    // Update project's updatedAt
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));

    return json({ success: true });
}
