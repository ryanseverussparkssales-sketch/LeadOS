import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data: contacts } = await supabaseAdmin.from('contacts').select('id, name, phone, phone_normalized, email, company').eq('user_id', ownerId).limit(1000);
	const all = contacts ?? [];

	// Find duplicates by phone_normalized
	const phoneMap = new Map<string, typeof all>();
	for (const c of all) {
		if (!c.phone_normalized) continue;
		const group = phoneMap.get(c.phone_normalized) ?? [];
		group.push(c);
		phoneMap.set(c.phone_normalized, group);
	}

	const duplicateGroups = [...phoneMap.values()].filter(g => g.length > 1).slice(0, 20);
	return json({ groups: duplicateGroups, total: duplicateGroups.length });
};
