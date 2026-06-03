import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contactId, sequenceId } = await request.json();
	if (!contactId || !sequenceId) throw error(400, 'contactId and sequenceId required');

	// Get first step
	const { data: steps } = await supabaseAdmin.from('sequence_steps').select('*').eq('sequence_id', sequenceId).order('step_number').limit(1);
	const firstStep = steps?.[0];

	const nextStepAt = firstStep
		? new Date(Date.now() + (firstStep.delay_days ?? 0) * 86400000).toISOString()
		: new Date().toISOString();

	const { data, error: e } = await supabaseAdmin.from('contact_sequences').upsert({
		contact_id: contactId, sequence_id: sequenceId,
		current_step: 0, status: 'active', started_at: new Date().toISOString(), next_step_at: nextStepAt,
	}, { onConflict: 'contact_id,sequence_id' }).select().single();

	if (e) throw error(400, e.message);
	return json(data);
};
