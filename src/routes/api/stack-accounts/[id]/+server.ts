import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { data, error: e } = await supabaseAdmin
		.from('stack_accounts')
		.select(`
			*,
			password_entry:password_vault(id, site_name, username, password_encrypted),
			api_key_entry:api_key_vault(id, name, service, key_value)
		`)
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();
	if (e) throw error(404, 'Not found');
	return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();

	const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
	const fields: [string, string][] = [
		['serviceName', 'service_name'], ['serviceCategory', 'service_category'],
		['serviceUrl', 'service_url'], ['serviceIcon', 'service_icon'],
		['loginEmail', 'login_email'], ['loginUsername', 'login_username'],
		['passwordVaultId', 'password_vault_id'], ['apiKeyVaultId', 'api_key_vault_id'],
		['status', 'status'], ['trialStart', 'trial_start'], ['trialEnd', 'trial_end'],
		['autoRenew', 'auto_renew'], ['cost', 'cost'], ['billingCycle', 'billing_cycle'],
		['nextBillingDate', 'next_billing_date'], ['paymentMethodLabel', 'payment_method_label'],
		['annualCost', 'annual_cost'], ['notes', 'notes'], ['tags', 'tags'],
	];
	for (const [js, db] of fields) {
		if (b[js] !== undefined) update[db] = b[js];
	}

	const { data, error: e } = await supabaseAdmin
		.from('stack_accounts')
		.update(update)
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select()
		.single();
	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('stack_accounts').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
