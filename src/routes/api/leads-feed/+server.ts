import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
    const user = await requireAuth(request);

    const sourceId = url.searchParams.get('source_id');
    const limit = parseInt(url.searchParams.get('limit') ?? '50');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    const since = url.searchParams.get('since');

    let query = supabaseAdmin
        .from('contacts')
        .select(`
            id, name, phone, email, company, title,
            lead_source, lead_source_id, contact_score,
            utm_source, utm_medium, utm_campaign,
            lead_metadata, contact_type, status,
            created_at, updated_at
        `, { count: 'exact' })
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

    if (sourceId) {
        query = query.eq('lead_source_id', sourceId);
    } else {
        // Default: show all contacts with a non-manual lead_source
        query = query.not('lead_source', 'eq', 'manual').not('lead_source', 'is', null);
    }

    if (since) {
        query = query.gte('created_at', since);
    }

    const { data, error, count } = await query;
    if (error) {
        console.error('[leads-feed GET]', error.message);
        return json({ data: [], count: 0 });
    }

    return json({ data: data ?? [], count: count ?? 0 });
};
