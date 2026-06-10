import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import { initialContactScore } from '$lib/server/scoring';
import type { RequestHandler } from './$types';

// Assign a contact to a call list and/or campaign, with ownership checks.
// Both are best-effort idempotent (no duplicate membership rows).
async function assignContact(userId: string, contactId: string, callListId?: string, campaignId?: string) {
	const assigned = { callList: false, campaign: false };

	if (callListId) {
		const { data: list } = await supabaseAdmin
			.from('call_lists').select('id').eq('id', callListId).eq('user_id', userId).maybeSingle();
		if (list) {
			const { data: already } = await supabaseAdmin
				.from('call_list_contacts').select('id').eq('call_list_id', callListId).eq('contact_id', contactId).maybeSingle();
			if (!already) {
				const { error: insErr } = await supabaseAdmin
					.from('call_list_contacts').insert({ call_list_id: callListId, contact_id: contactId, status: 'pending' });
				if (insErr) console.error('[scraper/accept] call_list_contacts insert failed:', insErr);
				else assigned.callList = true;
			} else assigned.callList = true;
		}
	}

	if (campaignId) {
		// Ownership via project -> client -> user_id (campaigns.user_id can be null on legacy rows)
		const { data: campaign } = await supabaseAdmin
			.from('campaigns')
			.select('id, user_id, project:projects(client:clients(user_id))')
			.eq('id', campaignId).maybeSingle();
		const ownerOk = campaign && (
			campaign.user_id === userId ||
			(campaign.project as unknown as { client?: { user_id?: string } })?.client?.user_id === userId
		);
		if (ownerOk) {
			const { data: already } = await supabaseAdmin
				.from('campaign_contacts').select('id').eq('campaign_id', campaignId).eq('contact_id', contactId).maybeSingle();
			if (!already) {
				const { error: insErr } = await supabaseAdmin
					.from('campaign_contacts').insert({ campaign_id: campaignId, contact_id: contactId });
				if (insErr) console.error('[scraper/accept] campaign_contacts insert failed:', insErr);
				else assigned.campaign = true;
			} else assigned.campaign = true;
		}
	}

	return assigned;
}

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { scrapedId, callListId, campaignId } = await request.json();
	if (!scrapedId) throw error(400, 'scrapedId required');

	const { data: scraped } = await supabaseAdmin
		.from('scraped_contacts').select('*').eq('id', scrapedId).eq('user_id', user.id).single();
	if (!scraped) throw error(404, 'Not found');

	const phone = scraped.raw_phone ? normalizePhone(scraped.raw_phone) : null;
	if (phone) {
		const { data: existing } = await supabaseAdmin
			.from('contacts').select('id').eq('user_id', user.id).eq('phone_normalized', phone).maybeSingle();
		if (existing) {
			await supabaseAdmin.from('scraped_contacts').update({ status: 'added', contact_id: existing.id }).eq('id', scrapedId);
			const assigned = await assignContact(user.id, existing.id, callListId, campaignId);
			return json({ status: 'duplicate', contactId: existing.id, assigned });
		}
	}

	const { data: contact, error: cErr } = await supabaseAdmin.from('contacts').insert({
		user_id: user.id,
		name: scraped.raw_name ?? 'Unknown',
		phone: scraped.raw_phone ?? '',
		phone_normalized: phone,
		email: scraped.raw_email ?? null,
		email_normalized: scraped.raw_email?.toLowerCase() ?? null,
		company: scraped.raw_company ?? null,
		title: scraped.raw_title ?? null,
		status: 'active',
	}).select().single();
	if (cErr) console.error('[scraper/accept] contact insert failed:', cErr);

	// Mark the scraped row as added so the "Added" state survives a reload.
	let assigned = { callList: false, campaign: false };
	if (contact) {
		await supabaseAdmin.from('scraped_contacts')
			.update({ status: 'added', contact_id: contact.id }).eq('id', scrapedId);
		assigned = await assignContact(user.id, contact.id, callListId, campaignId);
	}
	return json({ success: true, contactId: contact?.id, assigned });
};
