import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readFileSync } from 'fs';
import { getStorageAccess } from '$lib/backend/storage-access';

const INLINE_SAFE_MIME_TYPES = new Set([
	'application/pdf',
	'text/plain',
	'text/markdown',
	'text/x-markdown',
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/bmp',
	'image/heic',
	'image/heif',
]);

function isInlineSafe(mimeType: string): boolean {
	if (INLINE_SAFE_MIME_TYPES.has(mimeType)) return true;
	if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return true;
	if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') return true;
	return false;
}

function getSafeFilename(filename: string): string {
	const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
	return sanitized || 'file';
}

// GET - Serve file by ID
export const GET: RequestHandler = async ({ params, request }) => {
    const { id } = params;

	const access = await getStorageAccess(id, request);
	if (!access) {
		return error(404, 'File not found');
	}

	const { storage: file, isPublic } = access;

    if (!existsSync(file.path)) {
        return error(404, 'File not found on disk');
    }

    const content = readFileSync(file.path);
	const isSafeInline = isInlineSafe(file.mimeType);
	const contentType = isSafeInline ? file.mimeType : 'application/octet-stream';
	const dispositionType = isSafeInline ? 'inline' : 'attachment';
	const safeFilename = getSafeFilename(file.filename);
	const cacheControl = isPublic
		? 'public, max-age=31536000, immutable'
		: 'private, max-age=0, must-revalidate';

    return new Response(content, {
        headers: {
            'Content-Type': contentType,
            'Content-Length': file.size.toString(),
            'Cache-Control': cacheControl,
			'Content-Disposition': `${dispositionType}; filename="${safeFilename}"`,
			'X-Content-Type-Options': 'nosniff',
			'Vary': 'Cookie, Authorization',
        },
    });
};
