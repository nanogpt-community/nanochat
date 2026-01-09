import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveFile } from '$lib/backend/storage';
import { db } from '$lib/db';
import { user } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// POST - Upload avatar image
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);

    const contentType = request.headers.get('content-type') || '';

    // Handle multipart form data
    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            throw error(400, 'No file provided');
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            throw error(400, 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
        }

        if (file.size > MAX_FILE_SIZE) {
            throw error(400, 'File too large. Maximum size is 5MB.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate a unique filename with user ID prefix for organization
        const ext = file.name.split('.').pop() || 'jpg';
        const filename = `avatar-${userId}-${Date.now()}.${ext}`;

        // Save file using existing storage infrastructure
        const savedFile = await saveFile(buffer, filename, file.type, userId);

        // Construct the public URL for the uploaded image
        const imageUrl = `/api/storage/${savedFile.id}`;

        // Update user's image field directly in the database
        await db.update(user)
            .set({
                image: imageUrl,
                updatedAt: new Date()
            })
            .where(eq(user.id, userId));

        return json({
            success: true,
            imageUrl
        });
    }

    // Handle raw binary upload with headers
    const mimeType = (contentType.split(';')[0] || '').trim();

    if (!ALLOWED_TYPES.includes(mimeType)) {
        throw error(400, 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
    }

    const body = await request.arrayBuffer();

    if (body.byteLength > MAX_FILE_SIZE) {
        throw error(400, 'File too large. Maximum size is 5MB.');
    }

    const ext = mimeType.split('/')[1] || 'jpg';
    const filename = `avatar-${userId}-${Date.now()}.${ext}`;

    const savedFile = await saveFile(Buffer.from(body), filename, mimeType, userId);
    const imageUrl = `/api/storage/${savedFile.id}`;

    // Update user's image field
    await db.update(user)
        .set({
            image: imageUrl,
            updatedAt: new Date()
        })
        .where(eq(user.id, userId));

    return json({
        success: true,
        imageUrl
    });
};
