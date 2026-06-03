import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('email_sequences').select('*, steps:sequence_steps(*)').eq('user_id', ownerId).order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, description, triggerType, steps } = await request.json();
	if (!name?.trim()) throw error(400, 'name required');

	const { data: seq, error: e } = await supabaseAdmin.from('email_sequences').insert({ user_id: ownerId, name: name.trim(), description, trigger_type: triggerType ?? 'manual' }).select().single();
	if (e) throw error(400, e.message);

	if (steps?.length) {
		await supabaseAdmin.from('sequence_steps').insert(
			steps.map((s: Record<string, unknown>, i: number) => ({
				sequence_id: seq.id,
				step_number: i + 1,
				step_type:   s.step_type,
				day_offset:  s.day_offset,
				subject:     s.subject,
				body:        s.body,
				template_id: s.template_id,
				delay_hours: s.delay_hours,
			}))
		);
	}
	return json(seq);
};
