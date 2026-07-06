import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { sendEmail } from '$lib/server/email';
import { getTwilioCreds, twilioBasicAuth, type TwilioCreds } from '$lib/server/twilio';
import { rateLimitUser } from '$lib/server/rateLimit';
import type { RequestHandler } from './$types';

interface StepContact {
	id: string;
	name: string | null;
	email: string | null;
	company: string | null;
	phone: string | null;
	title: string | null;
	status: string | null;
}

// Same placeholder substitution the SMS send route uses ({{name}}, {{company}},
// {{phone}}, {{email}}, {{title}}) — see /api/sms/send.
function resolveTemplate(text: string, contact: StepContact | null): string {
	if (!contact || !/\{\{/.test(text)) return text;
	return text
		.replace(/\{\{name\}\}/gi, contact.name ?? '')
		.replace(/\{\{company\}\}/gi, contact.company ?? '')
		.replace(/\{\{phone\}\}/gi, contact.phone ?? '')
		.replace(/\{\{email\}\}/gi, contact.email ?? '')
		.replace(/\{\{title\}\}/gi, contact.title ?? '');
}

// Hour-of-day (0–23) in the given IANA timezone; falls back to UTC when the
// timezone is missing or invalid (e.g. legacy junk values in user_settings).
function hourInTimezone(timezone: string | null | undefined): number {
	try {
		const h = new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			hour12: false,
			timeZone: timezone || 'UTC',
		}).format(new Date());
		return parseInt(h, 10) % 24;
	} catch {
		return new Date().getUTCHours();
	}
}

const SMS_QUIET_HOUR_START = 9; // inclusive — earliest local send hour
const SMS_QUIET_HOUR_END = 20; // exclusive — no sends at/after 20:00 local

interface OwnerSmsContext {
	creds: TwilioCreds;
	timezone: string | null;
}

/**
 * Execute an SMS step.
 * Returns:
 *  - 'sent'    — message dispatched (or failed at Twilio; logged as failed) → advance
 *  - 'skipped' — guard rail hit (DNC / no phone / no creds / no body) → advance without sending
 *  - 'hold'    — quiet hours → do NOT advance; the enrollment stays due and retries next run
 */
async function executeSmsStep(
	enrollment: { id: string; user_id: string; contact_id: string; campaign_id: string | null },
	step: { id: string; sms_body: string | null },
	contact: StepContact | null,
	ctx: OwnerSmsContext
): Promise<'sent' | 'skipped' | 'hold'> {
	const skip = (reason: string): 'skipped' => {
		console.warn(`[sequences/advance] sms step skipped (enrollment ${enrollment.id}): ${reason}`);
		return 'skipped';
	};

	// Guard rails — skip (advance without sending) when sending is impossible/forbidden.
	if (!contact) return skip('contact not found');
	if (contact.status === 'do_not_call') return skip('contact is do_not_call');
	if (!contact.phone) return skip('contact has no phone number');
	if (!ctx.creds.hasRest) return skip('owner has no SMS-capable Twilio credentials');

	// From number: campaign's assigned number first, then the owner's default.
	let from = ctx.creds.phoneNumber || '';
	if (enrollment.campaign_id) {
		const { data: camp } = await supabaseAdmin
			.from('campaigns')
			.select('from_phone_number_id')
			.eq('id', enrollment.campaign_id)
			.maybeSingle();
		if (camp?.from_phone_number_id) {
			const { data: pn } = await supabaseAdmin
				.from('phone_numbers')
				.select('phone_number')
				.eq('id', camp.from_phone_number_id)
				.maybeSingle();
			if (pn?.phone_number) from = pn.phone_number;
		}
	}
	if (!from) return skip('no from number configured');

	const body = (step.sms_body ?? '').trim();
	if (!body) return skip('step has no sms_body');

	// Quiet hours: contact-local time is unknown (contacts carry no timezone), so use
	// the owner-account timezone when stored, else UTC. Hold (retry next run) outside 9–20.
	const hour = hourInTimezone(ctx.timezone);
	if (hour < SMS_QUIET_HOUR_START || hour >= SMS_QUIET_HOUR_END) {
		console.log(
			`[sequences/advance] sms step held for quiet hours (enrollment ${enrollment.id}, local hour ${hour})`
		);
		return 'hold';
	}

	const resolvedBody = resolveTemplate(body, contact);

	// Send via Twilio REST — same mechanics as /api/sms/send.
	const formData = new URLSearchParams({ To: contact.phone, From: from, Body: resolvedBody });
	const res = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${ctx.creds.accountSid}/Messages.json`,
		{
			method: 'POST',
			headers: {
				Authorization: twilioBasicAuth(ctx.creds),
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: formData.toString(),
		}
	).catch((err) => {
		console.error(`[sequences/advance] sms fetch failed (enrollment ${enrollment.id}):`, err);
		return null;
	});

	let status = 'failed';
	let twilioSid: string | null = null;
	if (res?.ok) {
		const twilioData = (await res.json()) as { sid: string; status: string };
		status = twilioData.status;
		twilioSid = twilioData.sid;
	} else if (res) {
		const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
		console.error(
			`[sequences/advance] Twilio SMS failed (enrollment ${enrollment.id}): ${errBody?.message ?? res.status}`
		);
	}

	// Log the SMS — same shape as /api/sms/send writes to sms_logs.
	await supabaseAdmin.from('sms_logs').insert({
		user_id: enrollment.user_id,
		contact_id: enrollment.contact_id,
		from_number: from,
		to_number: contact.phone,
		body: resolvedBody,
		direction: 'outbound',
		status,
		twilio_sid: twilioSid,
	});

	return 'sent';
}

/**
 * Execute a call_task step: create a high-priority call task, then advance.
 * Enrollments don't carry an SDR directly; the campaign's assigned SDRs
 * (campaign_sdrs → team_members) are preferred as the task assignee. The task
 * stays owner-scoped via user_id (tenancy) with the SDR on assigned_to.
 */
async function executeCallTaskStep(
	enrollment: { id: string; user_id: string; contact_id: string; campaign_id: string | null },
	step: { id: string },
	contact: StepContact | null
): Promise<void> {
	let assignedTo: string | null = null;
	if (enrollment.campaign_id) {
		const { data: sdrRows } = await supabaseAdmin
			.from('campaign_sdrs')
			.select('sdr_id')
			.eq('campaign_id', enrollment.campaign_id);
		const sdrIds = (sdrRows ?? []).map((r) => r.sdr_id).filter(Boolean);
		if (sdrIds.length) {
			const { data: member } = await supabaseAdmin
				.from('team_members')
				.select('member_user_id')
				.in('id', sdrIds)
				.eq('status', 'active')
				.not('member_user_id', 'is', null)
				.limit(1)
				.maybeSingle();
			assignedTo = member?.member_user_id ?? null;
		}
	}

	const { error: taskErr } = await supabaseAdmin.from('tasks').insert({
		user_id: enrollment.user_id,
		assigned_to: assignedTo,
		contact_id: enrollment.contact_id,
		campaign_id: enrollment.campaign_id ?? null,
		title: `Sequence call: ${contact?.name ?? 'contact'}`,
		task_type: 'call',
		priority: 'high',
		status: 'pending',
		due_date: new Date().toISOString(),
		source: 'sequence',
		source_id: step.id,
	});
	if (taskErr) {
		console.error(
			`[sequences/advance] call task insert failed (enrollment ${enrollment.id}): ${taskErr.message}`
		);
	}
}

async function advanceSequences(ownerId: string): Promise<number> {
	const now = new Date().toISOString();
	const { data: dueEnrollments } = await supabaseAdmin
		.from('contact_sequences')
		.select('*, campaign_id, sequence:email_sequences(id, user_id), steps:email_sequences(steps:sequence_steps(*))')
		.eq('status', 'active')
		.eq('user_id', ownerId)
		.lte('next_step_at', now)
		.limit(50);

	// Per-owner SMS context (Twilio creds + timezone), resolved once and reused.
	let smsCtx: OwnerSmsContext | null = null;
	const getSmsCtx = async (): Promise<OwnerSmsContext> => {
		if (!smsCtx) {
			const creds = await getTwilioCreds(ownerId);
			const { data: settings } = await supabaseAdmin
				.from('user_settings')
				.select('timezone')
				.eq('user_id', ownerId)
				.maybeSingle();
			smsCtx = { creds, timezone: settings?.timezone ?? null };
		}
		return smsCtx;
	};

	let advanced = 0;
	for (const enrollment of dueEnrollments ?? []) {
		try {
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
				.select('id, name, email, company, phone, title, status')
				.eq('id', enrollment.contact_id)
				.maybeSingle();

			const channel =
				step.channel === 'sms' || step.channel === 'call_task' ? step.channel : 'email';

			if (channel === 'sms') {
				const result = await executeSmsStep(enrollment, step, contact ?? null, await getSmsCtx());
				if (result === 'hold') continue; // quiet hours — retry next run, do not advance
			} else if (channel === 'call_task') {
				await executeCallTaskStep(enrollment, step, contact ?? null);
			} else {
				// email — existing behavior, untouched
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
		} catch (err) {
			console.error('[sequences/advance] enrollment', enrollment.id, 'failed:', err);
		}
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
