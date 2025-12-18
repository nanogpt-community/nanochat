import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { db, generateId } from '$lib/db';
import { storage } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function getSessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
        throw error(401, 'Unauthorized');
    }
    return session.user.id;
}

// POST - Upload file
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getSessionUserId(request);

    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const body = await request.arrayBuffer();

    const id = generateId();
    const extension = contentType.split('/')[1] || 'bin';
    const filename = `${id}.${extension}`;
    const filepath = join(UPLOAD_DIR, filename);

    // Write file to disk
    writeFileSync(filepath, Buffer.from(body));

    // Store metadata in database
    const now = new Date();
    await db.insert(storage).values({
        id,
        userId,
        filename,
        mimeType: contentType,
        size: body.byteLength,
        path: filepath,
        createdAt: now,
    });

    return json({
        storageId: id,
        url: `/api/storage/${id}`,
    });
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
    const userId = await getSessionUserId(request);
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
