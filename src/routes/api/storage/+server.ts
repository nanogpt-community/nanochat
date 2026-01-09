import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, unlinkSync } from 'fs';
import { saveFile, deleteFile } from '$lib/backend/storage';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { db } from '$lib/db';
import { storage } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

// POST - Upload file
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const body = await request.arrayBuffer();

    // We typically don't have original filename in raw POST body upload unless in header
    // Helper function defaults if not provided, or we can assume a name
    const filename = request.headers.get('x-filename') || `upload-${Date.now()}`;

    try {
        const savedFile = await saveFile(Buffer.from(body), filename, contentType, userId);

        return json({
            storageId: savedFile.id,
            url: `/api/storage/${savedFile.id}`,
        });
    } catch (e) {
        console.error(e);
        return error(500, 'Failed to save file');
    }
};

// GET - Get file URL or download file
export const GET: RequestHandler = async ({ request, url }) => {
    const storageId = url.searchParams.get('id');

    if (!storageId) {
        return error(400, 'Missing storage id');
    }

    const file = await db.query.storage.findFirst({
        where: eq(storage.id, storageId),
    });

    if (!file) {
        return error(404, 'File not found');
    }

    // Return the URL for the file
    return json({ url: `/api/storage/${storageId}` });
};

// DELETE - Delete file
export const DELETE: RequestHandler = async ({ request, url }) => {
    const userId = await getAuthenticatedUserId(request);
    const storageId = url.searchParams.get('id');

    if (!storageId) {
        return error(400, 'Missing storage id');
    }

    const file = await db.query.storage.findFirst({
        where: eq(storage.id, storageId),
    });

    if (!file) {
        return error(404, 'File not found');
    }

    if (file.userId !== userId) {
        return error(403, 'Unauthorized');
    }

    // Delete file from disk
    if (existsSync(file.path)) {
        unlinkSync(file.path);
    }

    // Delete from database
    await db.delete(storage).where(eq(storage.id, storageId));

    return json({ ok: true });
};
