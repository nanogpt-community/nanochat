import { db } from '$lib/db';
import { userKeys } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { Provider } from '$lib/types';
import { decryptApiKey, isEncrypted } from '$lib/encryption';

export type ResolvedKey = { apiKey: string; usingServerKey: boolean };

/** User's own key wins; otherwise the server key, if configured. */
export function nanoGptKeyFromRecord(
	record: { key: string } | null | undefined
): ResolvedKey | null {
	if (record?.key) {
		return {
			apiKey: isEncrypted(record.key) ? decryptApiKey(record.key) : record.key,
			usingServerKey: false,
		};
	}
	if (process.env.NANOGPT_API_KEY) {
		return { apiKey: process.env.NANOGPT_API_KEY, usingServerKey: true };
	}
	return null;
}

export async function resolveNanoGptApiKey(userId: string): Promise<ResolvedKey | null> {
	const record = await db.query.userKeys.findFirst({
		where: and(eq(userKeys.userId, userId), eq(userKeys.provider, Provider.NanoGPT)),
	});
	return nanoGptKeyFromRecord(record);
}
