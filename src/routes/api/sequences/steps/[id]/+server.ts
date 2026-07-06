import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const CHANNELS = ['email', 'sms', 'call_task'];

interface StepRow {
	id: string;
	sequence_id: string;
	step_number: number;
	channel: string | null;
	subject: string;
	body: string;
	sms_body: string | null;
	email_type: string | null;
	delay_days: number | null;
	delay_hours: number | null;
	sequence?: { id: string; user_id: string } | null;
}

/**
 * Ownership chain: step → email_sequences → user_id.
 * Returns the step row (with its parent sequence) or throws 404 — a step that
 * exists but belongs to another owner is indistinguishable from a missing one.
 */
async function requireOwnedStep(stepId: string, ownerId: string): Promise<StepRow> {
	const { data: step } = await supabaseAdmin
		.from('sequence_steps')
		.select('*, sequence:email_sequences(id, user_id)')
		.eq('id', stepId)
		.maybeSingle();
	if (!step || step.sequence?.user_id !== ownerId) throw error(404, 'Step not found');
	return step as StepRow;
}

// PATCH /api/sequences/steps/[id]
// Accepts: channel, subject, body, sms_body, delay_days, delay_hours, email_type (all optional).
// Per-channel validation mirrors POST /api/sequences: email needs subject+body,
// sms needs sms_body; non-email channels store '' for the NOT NULL subject/body.
export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const step = await requireOwnedStep(params.id, ownerId);

	const patch = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!patch || typeof patch !== 'object') throw error(400, 'Invalid JSON body');

	// Effective channel: provided value (validated) else the stored one, defaulting to email.
	let channel = typeof step.channel === 'string' && CHANNELS.includes(step.channel) ? step.channel : 'email';
	if (patch.channel !== undefined) {
		if (typeof patch.channel !== 'string' || !CHANNELS.includes(patch.channel)) throw error(400, `channel must be one of: ${CHANNELS.join(', ')}`);
		channel = patch.channel;
	}

	// Effective content = provided value else stored value; validate per channel.
	const subject = patch.subject !== undefined ? String(patch.subject ?? '') : step.subject;
	const body = patch.body !== undefined ? String(patch.body ?? '') : step.body;
	const smsBody = patch.sms_body !== undefined ? String(patch.sms_body ?? '') : (step.sms_body ?? '');
	if (channel === 'email' && (!subject.trim() || !body.trim())) throw error(400, 'Email steps need a subject and body');
	if (channel === 'sms' && !smsBody.trim()) throw error(400, 'SMS steps need a message body');

	const update: Record<string, unknown> = {
		channel,
		// subject/body are NOT NULL — non-email channels store '' (matches create).
		subject: channel === 'email' ? subject : '',
		body: channel === 'email' ? body : '',
		sms_body: channel === 'sms' ? smsBody.trim() : null,
	};
	if (patch.delay_days !== undefined) update.delay_days = Math.max(0, Number(patch.delay_days) || 0);
	if (patch.delay_hours !== undefined) update.delay_hours = Math.max(0, Number(patch.delay_hours) || 0);
	if (patch.email_type !== undefined && typeof patch.email_type === 'string' && patch.email_type.trim()) update.email_type = patch.email_type.trim();

	const { data: updated, error: e } = await supabaseAdmin
		.from('sequence_steps')
		.update(update)
		.eq('id', step.id)
		.eq('sequence_id', step.sequence_id) // ownership re-anchored to the verified parent
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(updated);
};

// DELETE /api/sequences/steps/[id]
// Deletes one step, then re-numbers the remaining steps 1..n (step_number is the
// operative ordering column — advance/enroll walk it; step_order exists in the
// baseline schema and is kept in lockstep for the routes that sort by it).
// Returns { success, steps } with the re-numbered remainder.
export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const step = await requireOwnedStep(params.id, ownerId);

	const { error: delErr } = await supabaseAdmin
		.from('sequence_steps')
		.delete()
		.eq('id', step.id)
		.eq('sequence_id', step.sequence_id);
	if (delErr) throw error(400, delErr.message);

	// Re-number survivors so step_number stays a contiguous 1..n walk.
	const { data: remaining } = await supabaseAdmin
		.from('sequence_steps')
		.select('id, step_number')
		.eq('sequence_id', step.sequence_id)
		.order('step_number', { ascending: true });

	const renumbered: { id: string; step_number: number }[] = [];
	for (const [i, s] of (remaining ?? []).entries()) {
		const n = i + 1;
		if (s.step_number !== n) {
			const { error: numErr } = await supabaseAdmin
				.from('sequence_steps')
				.update({ step_number: n, step_order: n })
				.eq('id', s.id)
				.eq('sequence_id', step.sequence_id);
			if (numErr) console.error(`[sequences/steps] renumber failed for step ${s.id}: ${numErr.message}`);
		}
		renumbered.push({ id: s.id, step_number: n });
	}

	const { data: steps } = await supabaseAdmin
		.from('sequence_steps')
		.select('*')
		.eq('sequence_id', step.sequence_id)
		.order('step_number', { ascending: true });

	return json({ success: true, steps: steps ?? [], renumbered });
};
