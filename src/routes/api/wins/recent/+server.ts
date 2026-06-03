import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';

export const GET = async ({ request, url }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);
    const limit = parseInt(url.searchParams.get('limit') ?? '15');

    const { data } = await supabaseAdmin
        .from('campaign_wins')
        .select(`
            id, outcome, weight, created_at,
            contacts(name, company),
            campaigns(name)
        `)
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);

    return json((data ?? []).map((w: any) => ({
        ...w,
        contact: w.contacts ?? null,
        campaign: w.campaigns ?? null,
    })));
};
