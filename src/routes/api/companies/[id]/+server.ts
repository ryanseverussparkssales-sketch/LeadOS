import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    const { data } = await supabaseAdmin
        .from('companies')
        .select('*, client:clients(name), contacts(id, name, phone, email, title, status, contact_score)')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();
    if (!data) throw error(404, 'Company not found');
    return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    const body = await request.json();
    const { data, error: e } = await supabaseAdmin
        .from('companies')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id)
        .select('*, client:clients(name)')
        .single();
    if (e) throw error(400, e.message);
    return json(data);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
    const user = await requireAuth(request);
    const permanent = url.searchParams.get('permanent') === 'true';
    if (permanent) {
        await supabaseAdmin.from('companies').delete().eq('id', params.id).eq('user_id', user.id);
    } else {
        await supabaseAdmin.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', params.id).eq('user_id', user.id);
    }
    return json({ ok: true });
};
