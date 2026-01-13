import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, unlinkSync } from 'fs';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';
import { db } from '$lib/db';
import { storage } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

// DELETE - Clear all uploads for a user
export const DELETE: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    // Get all files for the user
    const files = await db.query.storage.findMany({
        where: eq(storage.userId, userId),
    });

    let deletedCount = 0;
    let errorCount = 0;

    // Delete each file from disk and database
    for (const file of files) {
        try {
            // Delete file from disk
            if (existsSync(file.path)) {
                unlinkSync(file.path);
            }
            deletedCount++;
        } catch (e) {
            console.error(`Failed to delete file ${file.id} from disk:`, e);
            errorCount++;
        }
    }

    // Delete all storage records for the user from database
    await db.delete(storage).where(eq(storage.userId, userId));

    return json({
        ok: true,
        deletedCount,
        errorCount,
    });
};
