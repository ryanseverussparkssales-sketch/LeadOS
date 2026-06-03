import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// POST: bulk create the same activity for multiple contacts
// Body: { contactIds: string[], activityType, title, description, outcome, scheduledAt, durationMinutes }
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { contactIds, activityType, title, description, outcome, scheduledAt, durationMinutes } = await request.json();

	if (!contactIds?.length) throw error(400, 'contactIds required');

	// Verify all contacts belong to this user
	const { data: validContacts } = await supabaseAdmin
		.from('contacts').select('id').eq('user_id', ownerId).in('id', contactIds);

	const validIds = (validContacts ?? []).map((c: any) => c.id);
	if (!validIds.length) throw error(403, 'No valid contacts found');

	const now = new Date().toISOString();
	const rows = validIds.map((contactId: string) => ({
		user_id: ownerId,
		contact_id: contactId,
		activity_type: activityType ?? 'note',
		title: title?.trim() || null,
		description: description?.trim() || null,
		outcome: outcome || null,
		scheduled_at: scheduledAt || now,
		duration_minutes: durationMinutes || null,
	}));

	const { data, error: e } = await supabaseAdmin
		.from('contact_activities')
		.insert(rows)
		.select();

	if (e) throw error(400, e.message);
	return json({ created: data?.length ?? 0, skipped: contactIds.length - validIds.length }, { status: 201 });
};
