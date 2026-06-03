import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { sendEmail } from '$lib/server/email';
import type { RequestHandler } from './$types';

function generateICS(opts: {
	uid: string; title: string; start: Date; end: Date;
	description?: string; location?: string; organizerEmail?: string;
}): string {
	const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
	const esc = (s: string) => s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//LeadOS//EN',
		'METHOD:REQUEST',
		'BEGIN:VEVENT',
		`UID:${opts.uid}@leados`,
		`DTSTAMP:${fmt(new Date())}`,
		`DTSTART:${fmt(opts.start)}`,
		`DTEND:${fmt(opts.end)}`,
		`SUMMARY:${esc(opts.title)}`,
		opts.description ? `DESCRIPTION:${esc(opts.description)}` : '',
		opts.location    ? `LOCATION:${esc(opts.location)}`        : '',
		opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : '',
		'STATUS:CONFIRMED',
		'END:VEVENT',
		'END:VCALENDAR',
	].filter(Boolean).join('\r\n');
}

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const contactId = url.searchParams.get('contact_id');
	const campaignId = url.searchParams.get('campaign_id');
	const status = url.searchParams.get('status');
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

	let q = supabaseAdmin
		.from('appointments')
		.select('*, contact:contacts(id, name, phone, company), campaign:campaigns(id, name)')
		.eq('owner_user_id', ownerId)
		.order('scheduled_at', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: false })
		.limit(limit);

	if (contactId) q = q.eq('contact_id', contactId);
	if (campaignId) q = q.eq('campaign_id', campaignId);
	if (status) q = q.eq('status', status);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const {
		callId, contactId, campaignId,
		scheduledAt, durationMinutes, format,
		location, meetingLink, notes,
		qualifyingAnswers,
	} = await request.json();

	if (!contactId) throw error(400, 'contactId required');

	const { data: appt, error: e } = await supabaseAdmin
		.from('appointments')
		.insert({
			owner_user_id: ownerId,
			call_id: callId ?? null,
			contact_id: contactId,
			campaign_id: campaignId ?? null,
			scheduled_at: scheduledAt ?? null,
			duration_minutes: durationMinutes ?? 30,
			format: format ?? 'phone',
			location: location ?? null,
			meeting_link: meetingLink ?? null,
			notes: notes ?? null,
			qualifying_answers: qualifyingAnswers ?? {},
			status: 'scheduled',
		})
		.select('*, contact:contacts(id, name, phone, company)')
		.single();

	if (e) throw error(400, e.message);

	// Auto-create a follow-up task if appointment is scheduled
	if (scheduledAt && appt) {
		const apptDate = new Date(scheduledAt);
		const reminderDate = new Date(apptDate.getTime() - 60 * 60 * 1000); // 1hr before
		const { data: contact } = await supabaseAdmin
			.from('contacts').select('name').eq('id', contactId).single();

		await supabaseAdmin.from('tasks').insert({
			user_id: ownerId,
			contact_id: contactId,
			title: `Appointment with ${contact?.name ?? 'contact'} — ${apptDate.toLocaleDateString()} ${apptDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
			task_type: 'appointment',
			priority: 'high',
			status: 'pending',
			due_date: reminderDate.toISOString(),
		});
	}

	// Send ICS calendar invite (fire-and-forget)
	if (scheduledAt && appt) {
		(async () => {
			try {
				const start = new Date(scheduledAt);
				const end   = new Date(start.getTime() + (durationMinutes ?? 30) * 60_000);
				const contactName = (appt.contact as any)?.name ?? 'Contact';

				const ics = [
					'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//LeadOS//EN','METHOD:REQUEST',
					'BEGIN:VEVENT',
					`UID:${appt.id}@leados`,
					`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
					`DTSTART:${start.toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
					`DTEND:${end.toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
					`SUMMARY:Appointment — ${contactName}`,
					notes ? `DESCRIPTION:${notes.replace(/\n/g,'\\n')}` : '',
					'STATUS:CONFIRMED','END:VEVENT','END:VCALENDAR',
				].filter(Boolean).join('\r\n');

				const { sendEmail } = await import('$lib/server/email');
				const { data: campaign } = await supabaseAdmin
					.from('campaigns')
					.select('project:projects(client:clients(primary_contact_email))')
					.eq('id', campaignId ?? '').maybeSingle();
				const clientEmail = (campaign?.project as any)?.client?.primary_contact_email;
				const { data: contactRow } = await supabaseAdmin
					.from('contacts').select('email').eq('id', contactId).maybeSingle();

				const recipients = [clientEmail, contactRow?.email].filter(Boolean) as string[];
				if (recipients.length) {
					await sendEmail({
						userId: ownerId, to: recipients,
						subject: `📅 Appointment confirmed — ${contactName} · ${start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`,
						html: `<p>An appointment has been scheduled with <strong>${contactName}</strong>.</p><p><strong>Date:</strong> ${start.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p>`,
						attachments: [{ filename: 'appointment.ics', content: Buffer.from(ics).toString('base64'), encoding: 'base64', contentType: 'text/calendar; method=REQUEST' }],
					});
				}
			} catch (err) { console.error('[appointments] ICS email failed:', err); }
		})();
	}

	return json(appt, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	const body = await request.json();
	const allowed = ['scheduled_at','duration_minutes','format','location','meeting_link','notes','qualifying_answers','status'];
	const update: Record<string, unknown> = {};
	for (const k of allowed) { if (k in body) update[k] = body[k]; }

	const { data, error: e } = await supabaseAdmin
		.from('appointments')
		.update(update).eq('id', id).eq('owner_user_id', ownerId)
		.select().single();

	if (e) throw error(400, e.message);
	return json(data);
};
