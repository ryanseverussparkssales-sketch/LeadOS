import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const map: [string,string][] = [
		['basePay','base_pay'],['commission','commission'],['bonuses','bonuses'],
		['deductions','deductions'],['status','status'],['paidAt','paid_at'],
		['paymentMethod','payment_method'],['reference','reference'],['notes','notes'],
	];
	const update: Record<string,unknown> = {};
	for (const [js,db] of map) if (b[js] !== undefined) update[db] = b[js];
	if (b.status === 'paid' && !b.paidAt) update.paid_at = new Date().toISOString();

	const { data, error: e } = await supabaseAdmin.from('payroll_entries').update(update)
		.eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('payroll_entries').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
