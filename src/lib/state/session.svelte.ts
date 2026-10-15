import { page } from '$app/state';
import type { PublicAuthSession } from '#lib/auth-session.js';

export const session = {
	get current() {
		return page.data.session as PublicAuthSession | null;
	},
};
