import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: fetch activities for one or multiple contacts
// ?contact_id=xxx OR ?contact_ids=xxx,yyy,zzz&limit=50
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const contactId = url.searchParams.get('contact_id');
	const contactIds = url.searchParams.get('contact_ids')?.split(',').filter(Boolean);
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 200);

	let q = supabaseAdmin
		.from('contact_activities')
		.select('*, contact:contacts(id, name, company)')
		.eq('user_id', ownerId)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (contactId) {
		q = q.eq('contact_id', contactId);
	} else if (contactIds?.length) {
		q = q.in('contact_id', contactIds);
	}

	const { data, error: e } = await q;
	if (e) throw error(500, e.message);
	return json(data ?? []);
};

// POST: create one activity (for one contact)
// Body: { contactId, activityType, title, description, outcome, scheduledAt, durationMinutes }
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { contactId, activityType, title, description, outcome, scheduledAt, durationMinutes } = await request.json();

	if (!contactId) throw error(400, 'contactId required');

	// Verify contact ownership
	const { data: contact } = await supabaseAdmin
		.from('contacts').select('id').eq('id', contactId).eq('user_id', ownerId).maybeSingle();
	if (!contact) throw error(403, 'Contact not found');

	const { data, error: e } = await supabaseAdmin
		.from('contact_activities')
		.insert({
			user_id: ownerId,
			contact_id: contactId,
			activity_type: activityType ?? 'note',
			title: title?.trim() || null,
			description: description?.trim() || null,
			outcome: outcome || null,
			scheduled_at: scheduledAt || new Date().toISOString(),
			duration_minutes: durationMinutes || null,
		})
		.select('*, contact:contacts(id, name, company)')
		.single();

	if (e) throw error(400, e.message);
	return json(data, { status: 201 });
};

// PATCH: update activity
export const PATCH: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	const body = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('contact_activities')
		.update({ ...body, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', ownerId)
		.select()
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};

// DELETE: remove activity
export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	await supabaseAdmin.from('contact_activities').delete().eq('id', id).eq('user_id', ownerId);
	return json({ ok: true });
};
