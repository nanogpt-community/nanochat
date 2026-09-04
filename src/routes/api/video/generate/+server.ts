import { resolveNanoGptApiKey } from '$lib/backend/nanogpt-key.server';
import { checkSharedKeyUse } from '$lib/backend/shared-key-policy';
import { getNanoGPTModels } from '$lib/backend/models/nano-gpt';
import { supportsVideo } from '$lib/utils/model-capabilities';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';
import { getUserKey } from '$lib/db/queries';
import { nanoGptUrl } from '$lib/backend/nano-gpt-url.server';
import { readRedactedResponseText, redactSecrets } from '$lib/backend/secret-redaction';
import { readFile } from 'fs/promises';
import { db } from '$lib/db';
import { storage } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';

const getExplicitNanoGPTKey = (request: Request): string | null => {
	const headerKey = request.headers.get('x-api-key');
	if (headerKey && !headerKey.startsWith('nc_')) {
		return headerKey;
	}

	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token.length > 0 && !token.startsWith('nc_')) {
			return token;
		}
	}

	return null;
};

const resolveNanoGPTKey = async (
	request: Request,
	userId?: string
): Promise<{ apiKey: string; usingServerKey: boolean } | null> => {
	const explicitKey = getExplicitNanoGPTKey(request);
	if (explicitKey) return { apiKey: explicitKey, usingServerKey: false };
	if (!userId) return null;
	return resolveNanoGptApiKey(userId);
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	try {
		const body = await request.json();
		if (typeof body?.model !== 'string' || typeof body?.prompt !== 'string') {
			return json({ error: 'model and prompt are required' }, { status: 400 });
		}
		const catalog = await getNanoGPTModels();
		const modelInfo = catalog.isOk() ? catalog.value.find((m) => m.id === body.model) : undefined;
		if (!modelInfo || !supportsVideo(modelInfo)) {
			return json({ error: 'Unknown video model' }, { status: 400 });
		}

		const userId = await tryGetAuthenticatedUserId(request);
		const resolved = await resolveNanoGPTKey(request, userId);

		if (!resolved) {
			return json({ error: 'Authentication required or NanoGPT API key missing' }, { status: 401 });
		}
		if (userId) {
			const denial = await checkSharedKeyUse({
				userId,
				usingServerKey: resolved.usingServerKey,
				modelId: body.model,
			});
			if (denial) return json({ error: denial.message }, { status: denial.status });
		}
		const apiKey = resolved.apiKey;

		// A stored upload can't be fetched by NanoGPT, so it goes along inline.
		const { reference_image_id: referenceImageId, ...payload } = body;
		if (typeof referenceImageId === 'string' && userId) {
			const record = await db.query.storage.findFirst({
				where: and(eq(storage.id, referenceImageId), eq(storage.userId, userId)),
			});
			if (!record) {
				return json({ error: 'Reference image not found' }, { status: 404 });
			}
			const base64 = (await readFile(record.path)).toString('base64');
			payload.imageDataUrl = `data:${record.mimeType};base64,${base64}`;
		}

		const response = await fetch(nanoGptUrl('/api/generate-video'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errText = await readRedactedResponseText(response);
			return json(
				{ error: `NanoGPT API Error: ${errText || response.statusText}` },
				{ status: response.status }
			);
		}

		const data = await response.json();
		return json(data);
	} catch (error) {
		console.error(
			'[Video Generate] Server Error:',
			error instanceof Error ? redactSecrets(error.message) : 'unknown error'
		);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
