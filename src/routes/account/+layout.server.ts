import { redirectToLogin } from '$lib/backend/auth/redirect.js';
import { toPublicAuthSession } from '$lib/auth-session';
import { db } from '$lib/db';
import * as schema from '$lib/db/schema';
import { eq } from 'drizzle-orm';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const session = await locals.auth();

	if (!session) redirectToLogin(url);

	const passkeys = await db.query.passkey.findMany({
		where: eq(schema.passkey.userId, session.user.id),
	});

	return {
		session: toPublicAuthSession(session),
		passkeys,
	};
}
