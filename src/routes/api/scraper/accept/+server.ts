import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import { initialContactScore } from '$lib/server/scoring';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { scrapedId } = await request.json();
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
			return json({ status: 'duplicate', contactId: existing.id });
		}
	}

	const { data: contact } = await supabaseAdmin.from('contacts').insert({
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

	// Mark the scraped row as added so the "Added" state survives a reload.
	if (contact) {
		await supabaseAdmin.from('scraped_contacts')
			.update({ status: 'added', contact_id: contact.id }).eq('id', scrapedId);
	}
	return json({ success: true, contactId: contact?.id });
};
