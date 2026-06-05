import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { sendEmail } from '$lib/server/email';
import { rateLimitUser } from '$lib/server/rateLimit';
import type { RequestHandler } from './$types';

async function advanceSequences(ownerId: string): Promise<number> {
	const now = new Date().toISOString();
	const { data: dueEnrollments } = await supabaseAdmin
		.from('contact_sequences')
		.select('*, campaign_id, sequence:email_sequences(id, user_id), steps:email_sequences(steps:sequence_steps(*))')
		.eq('status', 'active')
		.eq('user_id', ownerId)
		.lte('next_step_at', now)
		.limit(50);

	let advanced = 0;
	for (const enrollment of dueEnrollments ?? []) {
		if (enrollment.sequence?.user_id !== ownerId) continue;

		const nextStep = enrollment.current_step + 1;
		const { data: step } = await supabaseAdmin
			.from('sequence_steps')
			.select('*')
			.eq('sequence_id', enrollment.sequence_id)
			.eq('step_number', nextStep)
			.maybeSingle();

		if (!step) {
			await supabaseAdmin.from('contact_sequences').update({ status: 'completed' }).eq('id', enrollment.id);
			continue;
		}

		const { data: contact } = await supabaseAdmin
			.from('contacts')
			.select('id, name, email, company')
			.eq('id', enrollment.contact_id)
			.maybeSingle();

		const toEmail = contact?.email;
		let sendStatus = 'draft';

		let senderAccountId: string | undefined;
		if (enrollment.campaign_id) {
			const { data: camp } = await supabaseAdmin
				.from('campaigns')
				.select('from_email_account_id, project:projects(from_email_account_id)')
				.eq('id', enrollment.campaign_id)
				.maybeSingle();
			senderAccountId = camp?.from_email_account_id
				?? (camp?.project as unknown as { from_email_account_id?: string } | null)?.from_email_account_id
				?? undefined;
		}

		if (toEmail) {
			const result = await sendEmail({
				to: toEmail,
				subject: step.subject || 'Following up',
				html: step.body?.replace(/\n/g, '<br>') || step.body || '',
				text: step.body || '',
				userId: enrollment.user_id,
				accountId: senderAccountId,
			}).catch(err => ({ success: false, error: String(err) }));

			sendStatus = result.success ? 'sent' : 'failed';

			await supabaseAdmin.from('email_logs').insert({
				user_id: enrollment.user_id,
				contact_id: enrollment.contact_id,
				subject: step.subject,
				email_type: step.email_type ?? 'follow_up',
				status: sendStatus,
				sent_at: result.success ? new Date().toISOString() : null,
				generated_by: 'sequence',
			});
		} else {
			await supabaseAdmin.from('email_logs').insert({
				user_id: enrollment.user_id,
				contact_id: enrollment.contact_id,
				subject: step.subject,
				email_type: step.email_type ?? 'follow_up',
				status: 'draft',
				generated_by: 'sequence',
			});
		}

		const { data: nextNextStep } = await supabaseAdmin
			.from('sequence_steps')
			.select('delay_days')
			.eq('sequence_id', enrollment.sequence_id)
			.eq('step_number', nextStep + 1)
			.maybeSingle();

		const nextStepAt = nextNextStep
			? new Date(Date.now() + (nextNextStep.delay_days ?? 1) * 86400000).toISOString()
			: null;

		await supabaseAdmin.from('contact_sequences').update({
			current_step: nextStep,
			next_step_at: nextStepAt,
			status: nextStepAt ? 'active' : 'completed',
		}).eq('id', enrollment.id);

		advanced++;
	}

	return advanced;
}

// Cron entrypoint — schedule in vercel.json (e.g. every 15 min). Finds every owner
// with a due, active enrollment and advances their sequences. Previously this was a
// no-op stub, so no follow-up email in any sequence ever sent.
export const GET: RequestHandler = async ({ request }) => {
	const { env } = await import('$env/dynamic/private');
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const now = new Date().toISOString();
	const { data: due } = await supabaseAdmin
		.from('contact_sequences')
		.select('user_id')
		.eq('status', 'active')
		.lte('next_step_at', now)
		.limit(1000);

	const ownerIds = [...new Set((due ?? []).map((d) => d.user_id))];
	let advanced = 0;
	for (const ownerId of ownerIds) {
		try {
			advanced += await advanceSequences(ownerId);
		} catch (err) {
			console.error('[sequences/advance] owner', ownerId, 'failed:', err);
		}
	}
	return json({ success: true, owners: ownerIds.length, advanced });
};

// Manual trigger for the logged-in owner (advance my own due sequences now).
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	if (await rateLimitUser(user.id, { max: 6, windowMs: 60000 })) throw error(429, 'Rate limit exceeded — slow down');
	const ownerId = await getEffectiveUserId(user.id);
	const advanced = await advanceSequences(ownerId);
	return json({ success: true, advanced });
};
