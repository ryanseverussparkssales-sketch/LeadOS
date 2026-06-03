import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import { deliverWebhooks } from '$lib/server/webhooks';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, phone, email, company, title, call_list_id } = await request.json();

	if (!phone?.trim() && !email?.trim()) throw error(400, 'phone or email required');

	// Tier check — free tier limited to 250 contacts
	const { getUserTier, TIER_LIMITS } = await import('$lib/server/tier');
	const tier = await getUserTier(user.id);
	if (tier === 'free') {
		const { count } = await supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null).then(r => ({ count: r.count ?? 0 }));
		if (count >= TIER_LIMITS.free.contacts) {
			throw error(403, `Free tier limit reached (${TIER_LIMITS.free.contacts} contacts). Upgrade to Pro for unlimited contacts.`);
		}
	}
	const resolvedName = name?.trim() || company?.trim() || phone?.trim() || 'Unknown';

	const phoneNorm = phone?.trim() ? normalizePhone(phone.trim()) : null;

	if (phoneNorm) {
		const { data: existing } = await supabaseAdmin
			.from('contacts').select('id').eq('user_id', user.id).eq('phone_normalized', phoneNorm).maybeSingle();
		if (existing) throw error(409, 'A contact with this phone number already exists');
	}

	const { data, error: e } = await supabaseAdmin.from('contacts').insert({
		user_id: user.id,
		name: resolvedName,
		phone: phone?.trim() ?? null,
		phone_normalized: phoneNorm,
		email: email?.trim() || null,
		email_normalized: email?.trim().toLowerCase() || null,
		company: company ?? null,
		title: title ?? null,
		status: 'active',
	}).select().single();
	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
