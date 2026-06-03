import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    const { campaign_id } = await request.json();

    if (!campaign_id) return json({ error: 'campaign_id required' }, { status: 400 });

    // Get campaign + verify it belongs to this user's data
    const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('id, project_id')
        .eq('id', campaign_id)
        .single();

    if (!campaign) return json({ error: 'Campaign not found' }, { status: 404 });

    // Find or create a call list for this campaign
    let { data: callList } = await supabaseAdmin
        .from('call_lists')
        .select('id')
        .eq('campaign_id', campaign_id)
        .limit(1)
        .single();

    if (!callList) {
        const { data: newList } = await supabaseAdmin
            .from('call_lists')
            .insert({
                name: 'Default',
                campaign_id,
                project_id: campaign.project_id,
                status: 'active',
            })
            .select()
            .single();
        callList = newList;
    }

    if (!callList) return json({ error: 'Could not get call list' }, { status: 500 });

    // Add contact to call list (upsert to avoid duplicates)
    const { error } = await supabaseAdmin
        .from('call_list_contacts')
        .upsert(
            { call_list_id: callList.id, contact_id: params.id },
            { onConflict: 'call_list_id,contact_id', ignoreDuplicates: true }
        );

    if (error) {
        console.error('[assign-campaign POST]', error.message);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ success: true });
};
