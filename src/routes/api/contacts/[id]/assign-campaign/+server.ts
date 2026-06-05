import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);
    const { campaign_id } = await request.json();

    if (!campaign_id) return json({ error: 'campaign_id required' }, { status: 400 });

    // Service role bypasses RLS — verify BOTH the contact and the campaign belong
    // to the caller's org before linking them (prevents cross-tenant IDOR).
    const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('id', params.id)
        .eq('user_id', ownerId)
        .maybeSingle();

    if (!contact) return json({ error: 'Contact not found' }, { status: 404 });

    // Campaign ownership is resolved through project → client → user_id.
    const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('id, project_id, project:projects(client:clients(user_id))')
        .eq('id', campaign_id)
        .single();

    const campaignOwner = (campaign?.project as { client?: { user_id?: string } } | null)?.client?.user_id;
    if (!campaign || campaignOwner !== ownerId) {
        return json({ error: 'Campaign not found' }, { status: 404 });
    }

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
