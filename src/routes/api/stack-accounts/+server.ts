import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { encryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('stack_accounts')
		.select(`
			*,
			password_entry:password_vault(id, site_name, username),
			api_key_entry:api_key_vault(id, name, service)
		`)
		.eq('user_id', user.id)
		.order('status')
		.order('service_category')
		.order('service_name');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();

	// Optionally create a password vault entry inline
	let passwordVaultId = b.passwordVaultId ?? null;
	if (b.createPassword && b.loginEmail && b.rawPassword) {
		const { data: pvEntry } = await supabaseAdmin
			.from('password_vault')
			.insert({
				user_id: user.id,
				site_name: b.serviceName,
				site_url: b.serviceUrl ?? null,
				username: b.loginEmail,
				password_encrypted: encryptValue(b.rawPassword), // encrypt server-side
				category: b.serviceCategory ?? 'general',
			})
			.select('id')
			.single();
		passwordVaultId = pvEntry?.id ?? null;
	}

	const { data, error: e } = await supabaseAdmin
		.from('stack_accounts')
		.insert({
			user_id: user.id,
			service_name: b.serviceName,
			service_category: b.serviceCategory ?? 'other',
			service_url: b.serviceUrl ?? null,
			service_icon: b.serviceIcon ?? null,
			login_email: b.loginEmail ?? null,
			login_username: b.loginUsername ?? null,
			password_vault_id: passwordVaultId,
			api_key_vault_id: b.apiKeyVaultId ?? null,
			status: b.status ?? 'active',
			trial_start: b.trialStart ?? null,
			trial_end: b.trialEnd ?? null,
			auto_renew: b.autoRenew ?? true,
			cost: b.cost ?? 0,
			billing_cycle: b.billingCycle ?? 'monthly',
			next_billing_date: b.nextBillingDate ?? null,
			payment_method_label: b.paymentMethodLabel ?? null,
			annual_cost: b.annualCost ?? null,
			notes: b.notes ?? null,
			tags: b.tags ?? [],
		})
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
