import type { Session, User } from 'better-auth';

export type AuthSession = {
	session: Session;
	user: User;
};

export type PublicAuthSession = {
	session: Omit<Session, 'token'>;
	user: User;
};

export function toPublicAuthSession(
	session: AuthSession | null | undefined
): PublicAuthSession | null {
	if (!session) {
		return null;
	}

	const { token: _token, ...publicSession } = session.session;

	return {
		session: publicSession,
		user: session.user,
	};
}
