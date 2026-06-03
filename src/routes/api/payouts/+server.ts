import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// GET — list payouts. Owner sees all; SDR sees own.
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const isOwner = ownerId === user.id;
	const status = url.searchParams.get('status');
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

	let q = supabaseAdmin
		.from('payouts')
		.select('*, team_member:team_members(id, member_email, stripe_connect_status), call:calls(id, outcome, contact:contacts(name, company))')
		.order('created_at', { ascending: false })
		.limit(limit);

	if (isOwner) {
		q = q.eq('owner_user_id', ownerId);
	} else {
		// SDR: find their team_member record then filter
		const { data: member } = await supabaseAdmin
			.from('team_members')
			.select('id')
			.eq('member_user_id', user.id)
			.maybeSingle();
		if (!member) return json([]);
		q = q.eq('team_member_id', member.id);
	}

	if (status) q = q.eq('status', status);

	const { data } = await q;
	return json(data ?? []);
};

// POST — approve a payout and trigger Stripe Transfer
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	if (ownerId !== user.id) throw error(403, 'Only the account owner can approve payouts');

	const { call_id, team_member_id, amount_cents, notes } = await request.json() as {
		call_id: string; team_member_id: string; amount_cents: number; notes?: string;
	};
	if (!call_id || !team_member_id || !amount_cents) throw error(400, 'call_id, team_member_id, amount_cents required');
	if (amount_cents < 50) throw error(400, 'Minimum payout is $0.50');

	// Get the rep's Stripe account
	const { data: member } = await supabaseAdmin
		.from('team_members')
		.select('id, stripe_connect_account_id, stripe_connect_status, member_email')
		.eq('id', team_member_id)
		.eq('owner_user_id', ownerId)
		.maybeSingle();

	if (!member) throw error(404, 'Team member not found');
	if (!member.stripe_connect_account_id) throw error(400, 'Rep has not connected Stripe yet');
	if (member.stripe_connect_status !== 'active') throw error(400, 'Rep Stripe account is not fully set up');

	// Check for duplicate payout on this call
	const { data: existing } = await supabaseAdmin
		.from('payouts')
		.select('id, status')
		.eq('call_id', call_id)
		.eq('team_member_id', team_member_id)
		.maybeSingle();

	if (existing && existing.status === 'paid') throw error(409, 'This call has already been paid out');

	// Create Stripe Transfer
	let stripeTransferId: string | null = null;
	let status = 'paid';

	if (env.STRIPE_SECRET_KEY) {
		const transferRes = await fetch('https://api.stripe.com/v1/transfers', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				amount: String(amount_cents),
				currency: 'usd',
				destination: member.stripe_connect_account_id,
				description: `LeadOS payout — call ${call_id}`,
				'metadata[call_id]': call_id,
				'metadata[team_member_id]': team_member_id,
			}),
		});

		if (!transferRes.ok) {
			const err = await transferRes.json() as { error?: { message?: string } };
			// Record as failed but don't throw — let admin see the failed state
			status = 'failed';
			const { data: failedPayout } = await supabaseAdmin.from('payouts').insert({
				owner_user_id: ownerId, team_member_id, call_id,
				amount_cents, status: 'failed',
				notes: err.error?.message ?? 'Stripe transfer failed',
			}).select().single();
			return json(failedPayout, { status: 200 });
		}

		const transfer = await transferRes.json() as { id: string };
		stripeTransferId = transfer.id;
	} else {
		// Stripe not configured — record as manual pending
		status = 'pending';
	}

	const { data: payout, error: dbErr } = await supabaseAdmin
		.from('payouts')
		.upsert({
			owner_user_id: ownerId, team_member_id, call_id,
			amount_cents, currency: 'usd',
			stripe_transfer_id: stripeTransferId,
			status,
			notes: notes ?? null,
			paid_at: status === 'paid' ? new Date().toISOString() : null,
		}, { onConflict: 'call_id,team_member_id' })
		.select()
		.single();

	if (dbErr) throw error(500, dbErr.message);
	return json(payout, { status: 201 });
};
