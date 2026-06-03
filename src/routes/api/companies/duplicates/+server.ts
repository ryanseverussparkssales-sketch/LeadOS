import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);

    // Find companies with similar names (same first 8 chars normalized)
    const { data: companies } = await supabaseAdmin
        .from('companies')
        .select('id, name, phone, city, state, company_type, industry, client_id')
        .eq('user_id', ownerId)
        .is('deleted_at', null)
        .order('name');

    if (!companies?.length) return json([]);

    // Group by name similarity (same first 8 chars normalized)
    const groups: Record<string, typeof companies> = {};
    for (const co of companies) {
        const key = co.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
        if (!groups[key]) groups[key] = [];
        groups[key].push(co);
    }

    const duplicates = Object.values(groups).filter(g => g.length > 1);
    return json(duplicates);
};
