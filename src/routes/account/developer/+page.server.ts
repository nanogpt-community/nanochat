import type { PageServerLoad } from './$types';
import { db } from '#lib/db/index.js';
import { apiKeys } from '#lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/auth.js';

export const load: PageServerLoad = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		throw redirect(302, '/login');
	}

	const keys = await db.query.apiKeys.findMany({
		where: eq(apiKeys.userId, session.user.id),
		columns: {
			id: true,
			name: true,
			lastUsedAt: true,
			createdAt: true,
		},
		orderBy: (keys, { desc }) => [desc(keys.createdAt)],
	});

	return { keys };
};
