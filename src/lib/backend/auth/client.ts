import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { ssoClient } from '@better-auth/sso/client';

export const authClient = createAuthClient({
	plugins: [passkeyClient(), ssoClient()],
});
