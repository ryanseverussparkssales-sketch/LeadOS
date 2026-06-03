import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();

	// Core access fields
	const update: Record<string, unknown> = {};
	if (b.role !== undefined) update.role = b.role;
	if (b.status !== undefined) update.status = b.status;

	// HR profile fields
	const hrMap: [string, string][] = [
		['firstName', 'first_name'], ['lastName', 'last_name'],
		['title', 'title'], ['department', 'department'],
		['hireDate', 'hire_date'], ['startDate', 'start_date'], ['endDate', 'end_date'],
		['contractType', 'contract_type'],
		['payRate', 'pay_rate'], ['payType', 'pay_type'], ['payFrequency', 'pay_frequency'],
		['phone', 'phone'], ['address', 'address'],
		['emergencyContactName', 'emergency_contact_name'],
		['emergencyContactPhone', 'emergency_contact_phone'],
		['quotaMonthly', 'quota_monthly'], ['commissionRate', 'commission_rate'],
		['notes', 'notes'], ['avatarUrl', 'avatar_url'],
	];
	for (const [js, db] of hrMap) {
		if (b[js] !== undefined) update[db] = b[js] === '' ? null : b[js];
	}

	if (Object.keys(update).length === 0) throw error(400, 'No fields to update');

	const { data, error: e } = await supabaseAdmin
		.from('team_members')
		.update(update)
		.eq('id', params.id)
		.eq('owner_user_id', user.id)
		.select()
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('team_members').delete().eq('id', params.id).eq('owner_user_id', user.id);
	return json({ success: true });
};
