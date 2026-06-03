import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const memberId = url.searchParams.get('memberId');
	const status = url.searchParams.get('status');

	let q = supabaseAdmin.from('payroll_entries')
		.select('*, member:team_members(member_email, first_name, last_name, title, role)')
		.eq('user_id', user.id)
		.order('pay_period_start', { ascending: false });

	if (memberId) q = q.eq('team_member_id', memberId);
	if (status) q = q.eq('status', status);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();

	const { data, error: e } = await supabaseAdmin.from('payroll_entries').insert({
		user_id: user.id,
		team_member_id: b.teamMemberId ?? null,
		member_email: b.memberEmail ?? null,
		pay_period_start: b.payPeriodStart,
		pay_period_end: b.payPeriodEnd,
		base_pay: b.basePay ?? 0,
		commission: b.commission ?? 0,
		bonuses: b.bonuses ?? 0,
		deductions: b.deductions ?? 0,
		status: b.status ?? 'pending',
		payment_method: b.paymentMethod ?? 'ach',
		notes: b.notes ?? null,
	}).select().single();

	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
