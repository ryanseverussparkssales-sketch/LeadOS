import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const isOwner = ownerId === user.id;
	const status = url.searchParams.get('status');

	let q = supabaseAdmin
		.from('voicemails').select('*, phone_number:phone_numbers(phone_number, friendly_name)')
		.eq('user_id', ownerId).order('received_at', { ascending: false }).limit(100);
	if (status) q = q.eq('status', status);
	const { data } = await q;
	let rows = data ?? [];

	// A rep only sees voicemails for the numbers assigned to them; the owner sees all.
	// Done in two steps (not a joined filter) so a not-yet-migrated assigned_user_id
	// column can't break the whole voicemail list.
	if (!isOwner) {
		const { data: myNums } = await supabaseAdmin
			.from('phone_numbers').select('id').eq('assigned_user_id', user.id);
		const allowed = new Set((myNums ?? []).map((n) => n.id));
		rows = rows.filter((v) => allowed.has((v as { phone_number_id?: string }).phone_number_id ?? ''));
	}

	return json(rows);
};
