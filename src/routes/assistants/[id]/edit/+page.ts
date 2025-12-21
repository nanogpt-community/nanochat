import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
    const res = await fetch(`/api/db/assistants/${params.id}`);
    if (!res.ok) {
        throw error(404, 'Assistant not found');
    }
    const assistant = await res.json();
    return { assistant };
};
