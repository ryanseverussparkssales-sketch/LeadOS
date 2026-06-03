import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const update: Record<string, unknown> = {};
	if (body.status !== undefined) update.status = body.status;
	if (body.paidAt !== undefined) update.paid_at = body.paidAt;
	if (body.paymentMethod !== undefined) update.payment_method = body.paymentMethod;
	if (body.paymentNotes !== undefined) update.payment_notes = body.paymentNotes;

	const { data, error: e } = await supabaseAdmin
		.from('invoices')
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
	const { error: e } = await supabaseAdmin
		.from('invoices')
		.delete()
		.eq('id', params.id)
		.eq('user_id', user.id);
	if (e) throw error(500, e.message);
	return json({ ok: true });
};
