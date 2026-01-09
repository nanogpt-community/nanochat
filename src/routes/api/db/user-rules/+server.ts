import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllUserRules, createRule, updateRule, renameRule, deleteRule } from '$lib/db/queries';
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

// GET - get all user rules
export const GET: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);
    const rules = await getAllUserRules(userId);
    return json(rules);
};

// POST - create or update rule
export const POST: RequestHandler = async ({ request }) => {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json();
    const { action } = body;

    switch (action) {
        case 'create': {
            const rule = await createRule(userId, {
                name: body.name,
                attach: body.attach,
                rule: body.rule,
            });
            return json(rule);
        }

        case 'update': {
            const rule = await updateRule(userId, body.ruleId, {
                attach: body.attach,
                rule: body.rule,
            });
            return json(rule);
        }

        case 'rename': {
            const rule = await renameRule(userId, body.ruleId, body.name);
            return json(rule);
        }

        default:
            return error(400, 'Invalid action');
    }
};

// DELETE - delete rule
export const DELETE: RequestHandler = async ({ request, url }) => {
    const userId = await getAuthenticatedUserId(request);
    const ruleId = url.searchParams.get('id');

    if (!ruleId) {
        return error(400, 'Missing rule id');
    }

    await deleteRule(userId, ruleId);
    return json({ ok: true });
};
