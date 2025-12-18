import { auth } from '$lib/auth';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request }) => {
    return auth.handler(request);
};

export const POST: RequestHandler = async ({ request }) => {
    return auth.handler(request);
};
