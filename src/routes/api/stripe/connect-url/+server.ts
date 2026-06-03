// Generate a Stripe Connect onboarding URL for an SDR
import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	if (!env.STRIPE_SECRET_KEY) throw error(503, 'Stripe not configured');

	// Get or create a Stripe Connect account for this user
	const { data: member } = await supabaseAdmin
		.from('team_members')
		.select('id, stripe_connect_account_id, stripe_connect_status')
		.eq('member_user_id', user.id)
		.maybeSingle();

	let accountId = member?.stripe_connect_account_id;

	if (!accountId) {
		// Create a new Express account
		const res = await fetch('https://api.stripe.com/v1/accounts', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({ type: 'express', 'capabilities[transfers][requested]': 'true' }),
		});
		if (!res.ok) {
			const err = await res.json() as { error?: { message?: string } };
			throw error(500, err.error?.message ?? 'Stripe account creation failed');
		}
		const account = await res.json() as { id: string };
		accountId = account.id;

		// Save the account ID
		if (member?.id) {
			await supabaseAdmin.from('team_members')
				.update({ stripe_connect_account_id: accountId, stripe_connect_status: 'pending' })
				.eq('id', member.id);
		}
	}

	// Generate onboarding link
	const baseUrl = env.PUBLIC_SITE_URL ?? env.PUBLIC_BASE_URL ?? 'https://lead-os-livid.vercel.app';
	const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			account: accountId,
			refresh_url: `${baseUrl}/sdr/performance?stripe=refresh`,
			return_url:  `${baseUrl}/sdr/performance?stripe=connected`,
			type: 'account_onboarding',
		}),
	});

	const link = await linkRes.json() as { url?: string; error?: { message?: string } };
	if (!link.url) throw error(500, link.error?.message ?? 'Failed to generate onboarding link');

	return json({ url: link.url });
};
