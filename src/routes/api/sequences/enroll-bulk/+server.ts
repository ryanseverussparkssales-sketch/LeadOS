import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';

/**
 * Bulk enroll multiple contacts in an email sequence.
 * POST body: { sequenceId: string, contactIds: string[], campaignId?: string }
 *
 * Enrolls each contact in the sequence, setting next_step_at based on
 * the sequence's first step delay. Skips contacts already enrolled.
 */
export const POST = async ({ request }: { request: Request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { sequenceId, contactIds, campaignId } = await request.json();

	if (!sequenceId || !contactIds?.length) {
		return json({ error: 'sequenceId and contactIds required' }, { status: 400 });
	}

	// Get the sequence and its first step
	const { data: sequence } = await supabaseAdmin
		.from('email_sequences')
		.select('id, name, steps:sequence_steps(id, step_order, delay_days, delay_hours)')
		.eq('id', sequenceId)
		.eq('user_id', ownerId)
		.single();

	if (!sequence) return json({ error: 'Sequence not found' }, { status: 404 });

	const firstStep = (sequence.steps as any[])
		?.sort((a, b) => a.step_order - b.step_order)[0];

	const delayMs =
		((firstStep?.delay_days ?? 0) * 24 * 60 + (firstStep?.delay_hours ?? 0) * 60) * 60 * 1000;
	const nextStepAt = new Date(Date.now() + delayMs).toISOString();

	// Build enrollment rows — skip already-enrolled contacts via upsert ignoreDuplicates
	const rows = contactIds.map((contactId: string) => ({
		contact_id: contactId,
		sequence_id: sequenceId,
		status: 'active',
		current_step: 0,
		next_step_at: nextStepAt,
		campaign_id: campaignId ?? null,
		enrolled_at: new Date().toISOString(),
		enrolled_by: user.id,
	}));

	// Insert in chunks of 50 to avoid hitting Supabase limits
	const CHUNK = 50;
	let enrolled = 0;
	let skipped = 0;
	let errors = 0;

	for (let i = 0; i < rows.length; i += CHUNK) {
		const chunk = rows.slice(i, i + CHUNK);
		const { data, error } = await supabaseAdmin
			.from('contact_sequences')
			.upsert(chunk, {
				onConflict: 'contact_id,sequence_id',
				ignoreDuplicates: true, // skip already-enrolled
			})
			.select('id');

		if (error) {
			console.error('[enroll-bulk] chunk error:', error.message);
			errors += chunk.length;
		} else {
			enrolled += data?.length ?? 0;
			skipped += chunk.length - (data?.length ?? 0);
		}
	}

	return json({
		enrolled,
		skipped,
		errors,
		total: contactIds.length,
		sequenceName: (sequence as any).name,
	});
};
