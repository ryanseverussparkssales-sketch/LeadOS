import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const now = new Date().toISOString().slice(0, 10);
	const { data } = await supabaseAdmin.from('quotas').select('*').eq('user_id', ownerId).lte('period_start', now).gte('period_end', now);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { quotaType, targetValue, period } = await request.json();
	if (!targetValue || !quotaType) throw error(400, 'quotaType and targetValue required');

	const now = new Date();
	let start: Date, end: Date;
	if (period === 'weekly') {
		start = new Date(now); start.setDate(now.getDate() - now.getDay());
		end = new Date(start); end.setDate(start.getDate() + 6);
	} else if (period === 'quarterly') {
		const q = Math.floor(now.getMonth() / 3);
		start = new Date(now.getFullYear(), q * 3, 1);
		end = new Date(now.getFullYear(), q * 3 + 3, 0);
	} else { // monthly
		start = new Date(now.getFullYear(), now.getMonth(), 1);
		end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	}

	const { data, error: e } = await supabaseAdmin.from('quotas').upsert({
		user_id: ownerId, quota_type: quotaType, target_value: targetValue, period,
		period_start: start.toISOString().slice(0, 10),
		period_end: end.toISOString().slice(0, 10),
	}, { onConflict: 'user_id,quota_type,period_start' }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
