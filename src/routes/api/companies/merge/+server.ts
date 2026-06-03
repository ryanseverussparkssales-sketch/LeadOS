import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const user = await requireAuth(request);
    const { keepId, mergeIds } = await request.json();
    if (!keepId || !mergeIds?.length) throw error(400, 'keepId and mergeIds required');

    // Move all contacts from merged companies to kept company
    for (const mergeId of mergeIds) {
        await supabaseAdmin.from('contacts').update({ company_id: keepId }).eq('company_id', mergeId).eq('user_id', user.id);
        // Soft-delete the merged company
        await supabaseAdmin.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', mergeId).eq('user_id', user.id);
    }

    return json({ ok: true, kept: keepId, merged: mergeIds.length });
};
