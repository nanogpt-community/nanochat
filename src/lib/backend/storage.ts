import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { db, generateId } from '$lib/db';
import { storage } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function saveFile(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    userId: string
) {
    const id = generateId();
    // Get extension from mimeType or original filename, fallback to bin
    let extension = mimeType.split('/')[1] || 'bin';
    if (extension.includes('+')) extension = extension.split('+')[0] ?? extension; // e.g. epub+zip -> epub

    // Clean extension
    extension = extension.replace(/[^a-zA-Z0-9]/g, '');

    // If extension seems generic or empty, try from filename
    if (!extension || extension === 'octet-stream') {
        const parts = originalFilename.split('.');
        if (parts.length > 1) {
            extension = parts.pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
        }
    }

    const filename = `${id}.${extension}`;
    const filepath = join(UPLOAD_DIR, filename);

    // Prevent path traversal
    if (!resolve(filepath).startsWith(resolve(UPLOAD_DIR))) {
        throw new Error('Invalid file path');
    }

    // Write file to disk
    writeFileSync(filepath, fileBuffer);

    // Store metadata in database
    const now = new Date();
    await db.insert(storage).values({
        id,
        userId,
        filename: originalFilename, // Store original filename
        mimeType,
        size: fileBuffer.byteLength,
        path: filepath,
        createdAt: now,
    });

    return {
        id,
        filename: originalFilename,
        path: filepath,
        mimeType,
        size: fileBuffer.byteLength,
        createdAt: now
    };
}

export async function deleteFile(storageId: string) {
    const file = await db.query.storage.findFirst({
        where: eq(storage.id, storageId),
    });

    if (!file) {
        return false;
    }

    // Delete file from disk
    if (existsSync(file.path)) {
        try {
            unlinkSync(file.path);
        } catch (e) {
            console.error('Failed to delete file from disk', e);
        }
    }

    // Delete from database
    await db.delete(storage).where(eq(storage.id, storageId));

    return true;
}
