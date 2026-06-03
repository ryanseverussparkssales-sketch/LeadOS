import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    await supabaseAdmin
        .from('email_accounts')
        .delete()
        .eq('id', params.id)
        .eq('user_id', user.id);
    return json({ ok: true });
};

export const PATCH: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    const body = await request.json();

    if (body.isDefault) {
        await supabaseAdmin
            .from('email_accounts')
            .update({ is_default: false })
            .eq('user_id', user.id);
    }

    const { data, error: e } = await supabaseAdmin
        .from('email_accounts')
        .update({
            is_default: body.isDefault ?? false,
            client_id: body.clientId ?? null,
            label: body.label,
        })
        .eq('id', params.id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (e) throw error(400, e.message);
    return json(data);
};
