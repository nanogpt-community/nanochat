import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { storage } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'fs';

// GET - Serve file by ID
export const GET: RequestHandler = async ({ params }) => {
    const { id } = params;

    const file = await db.query.storage.findFirst({
        where: eq(storage.id, id),
    });

    if (!file) {
        return error(404, 'File not found');
    }

    if (!existsSync(file.path)) {
        return error(404, 'File not found on disk');
    }

    const content = readFileSync(file.path);

    return new Response(content, {
        headers: {
            'Content-Type': file.mimeType,
            'Content-Length': file.size.toString(),
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
};
