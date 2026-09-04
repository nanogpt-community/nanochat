import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { statfs } from 'fs/promises';
import { join, resolve } from 'path';
import { error, isHttpError } from '@sveltejs/kit';
import { db, generateId } from '$lib/db';
import { storage } from '$lib/db/schema';
import { eq, sql } from 'drizzle-orm';

const MB = 1024 * 1024;
/**
 * Per-user cumulative cap across every stored object; 0 disables it. Unset means
 * 2 GB when strangers can sign up and no cap on a closed-signup install, so an
 * upgrade never locks an existing single-tenant user out of their own uploads.
 */
function defaultQuotaMb(): number {
	const configured = process.env.USER_STORAGE_QUOTA_MB;
	if (configured !== undefined && configured !== '') return Number(configured);
	return process.env.DISABLE_SIGNUPS === 'true' ? 0 : 2048;
}
export const USER_STORAGE_QUOTA_BYTES = defaultQuotaMb() * MB;
/** Refuse writes that would leave the volume below this; 0 disables it. */
const MIN_FREE_DISK_BYTES = Number(process.env.MIN_FREE_DISK_MB ?? 512) * MB;

export async function userStorageUsed(userId: string): Promise<number> {
	const [row] = await db
		.select({ used: sql<number>`coalesce(sum(${storage.size}), 0)` })
		.from(storage)
		.where(eq(storage.userId, userId));
	return Number(row?.used ?? 0);
}

/**
 * Throws 413 when the user's quota would be exceeded and 507 when the disk is
 * nearly full. Per-file caps alone let one account fill the volume the database
 * shares.
 */
export async function assertStorageAllowance(userId: string, incomingBytes: number): Promise<void> {
	if (USER_STORAGE_QUOTA_BYTES > 0) {
		const used = await userStorageUsed(userId);
		if (used + incomingBytes > USER_STORAGE_QUOTA_BYTES) {
			throw error(
				413,
				`Storage quota exceeded (${Math.round(USER_STORAGE_QUOTA_BYTES / MB)} MB). Delete some files in My Stuff to free space.`
			);
		}
	}
	if (MIN_FREE_DISK_BYTES > 0) {
		try {
			const stats = await statfs(UPLOAD_DIR);
			const free = Number(stats.bavail) * Number(stats.bsize);
			if (free - incomingBytes < MIN_FREE_DISK_BYTES) {
				throw error(507, 'The server is out of storage space.');
			}
		} catch (e) {
			// statfs unsupported on this runtime: quota above still applies
			if (isHttpError(e)) throw e;
		}
	}
}

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB

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
    await assertStorageAllowance(userId, fileBuffer.byteLength);

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
