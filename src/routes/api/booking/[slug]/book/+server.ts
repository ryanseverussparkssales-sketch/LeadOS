import { json } from '@sveltejs/kit';
import { supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import { rateLimit } from '$lib/server/rateLimit';
import { sendEmail } from '$lib/server/email';
import { PRODID } from '$lib/brand';
import { getActiveLinkBySlug, computeSlots, clampDays, zonedToUtc, type BookingLinkRow } from '../../_lib/slots';
import type { RequestHandler } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function buildIcs(opts: {
	uid: string; title: string; start: Date; end: Date;
	description?: string; organizerEmail?: string; attendeeEmail?: string;
}): string {
	const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
	const esc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:${PRODID}`,
		'METHOD:REQUEST',
		'BEGIN:VEVENT',
		`UID:${opts.uid}@leados`,
		`DTSTAMP:${fmt(new Date())}`,
		`DTSTART:${fmt(opts.start)}`,
		`DTEND:${fmt(opts.end)}`,
		`SUMMARY:${esc(opts.title)}`,
		opts.description ? `DESCRIPTION:${esc(opts.description)}` : '',
		opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : '',
		opts.attendeeEmail ? `ATTENDEE;RSVP=TRUE:mailto:${opts.attendeeEmail}` : '',
		'STATUS:CONFIRMED',
		'END:VEVENT',
		'END:VCALENDAR',
	].filter(Boolean).join('\r\n');
}

/** Find-or-create a contact for the LINK OWNER (never trusts a client-sent user id). */
async function upsertContact(link: BookingLinkRow, opts: {
	name: string; email: string; phone: string; notes: string;
}): Promise<{ id: string } | null> {
	const phoneNorm = opts.phone ? normalizePhone(opts.phone) : null;
	const emailNorm = opts.email.toLowerCase();

	// Dedup by phone first, then email — mirrors api/webhook/[token].
	let existing: { id: string } | null = null;
	if (phoneNorm) {
		const { data } = await supabaseAdmin
			.from('contacts').select('id')
			.eq('user_id', link.user_id)
			.eq('phone_normalized', phoneNorm)
			.maybeSingle();
		existing = data;
	}
	if (!existing) {
		const { data } = await supabaseAdmin
			.from('contacts').select('id')
			.eq('user_id', link.user_id)
			.eq('email_normalized', emailNorm)
			.maybeSingle();
		existing = data;
	}
	if (existing) {
		await supabaseAdmin.from('contacts')
			.update({ updated_at: new Date().toISOString() })
			.eq('id', existing.id);
		return existing;
	}

	const { data: created, error: e } = await supabaseAdmin
		.from('contacts')
		.insert({
			user_id: link.user_id,
			name: opts.name,
			phone: opts.phone || null,
			phone_normalized: phoneNorm,
			email: opts.email,
			email_normalized: emailNorm,
			contact_type: 'lead',
			status: 'new',
			notes: opts.notes,
			lead_metadata: { lead_source: 'booking_link', booking_link_slug: link.slug },
		})
		.select('id')
		.single();
	if (e) {
		console.error('[booking/book] contact insert failed:', e.message);
		return null;
	}
	return created;
}

// PUBLIC endpoint — no auth. All writes are scoped to the booking link's owner.
export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	let clientIp = 'unknown';
	try { clientIp = getClientAddress(); } catch { /* not available in some adapters */ }
	const rl = rateLimit(`bk:book:${clientIp}`, 10, 60_000);
	if (!rl.ok) {
		return json(
			{ error: 'Too many requests' },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds ?? 60) } },
		);
	}

	const link = await getActiveLinkBySlug(params.slug);
	if (!link) return json({ error: 'Booking link not found' }, { status: 404 });

	const body = await request.json().catch(() => ({}));
	const date = typeof body.date === 'string' ? body.date.trim() : '';
	const time = typeof body.time === 'string' ? body.time.trim() : '';
	const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
	const email = typeof body.email === 'string' ? body.email.trim().slice(0, 320) : '';
	const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
	const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

	if (!name) return json({ error: 'Name is required' }, { status: 400 });
	if (!email || !EMAIL_RE.test(email)) return json({ error: 'A valid email is required' }, { status: 400 });
	if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
		return json({ error: 'date (YYYY-MM-DD) and time (HH:MM) are required' }, { status: 400 });
	}

	// Re-validate the slot is still bookable (availability + notice + no overlap).
	// Recomputed from the DB right now, so a slot taken since the page loaded 409s.
	try {
		const horizon = clampDays(link, link.max_days_ahead ?? 14);
		const daySlots = await computeSlots(link, horizon);
		const day = daySlots.find((d) => d.date === date);
		if (!day || !day.slots.includes(time)) {
			return json({ error: 'slot_taken', message: 'That time was just taken — please pick another slot.' }, { status: 409 });
		}
	} catch (err) {
		console.error('[booking/book] slot validation failed:', err);
		return json({ error: 'Could not validate the slot' }, { status: 500 });
	}

	const start = zonedToUtc(date, time, link.timezone);
	const end = new Date(start.getTime() + link.duration_minutes * 60_000);

	// Contact: dedup by phone/email within the owner's tenant, create if new.
	const contact = await upsertContact(link, {
		name, email, phone,
		notes: `Booked via booking link "${link.title}" (${link.slug})${notes ? ` — ${notes}` : ''}`,
	});
	if (!contact) return json({ error: 'Could not create contact' }, { status: 500 });

	// Appointment — matches the appointments schema used by the win flow.
	// (appointments has no client_id column; the link's client_id is kept in
	// qualifying_answers so reporting can attribute it.)
	const { data: appt, error: apptErr } = await supabaseAdmin
		.from('appointments')
		.insert({
			owner_user_id: link.user_id,
			contact_id: contact.id,
			campaign_id: link.campaign_id ?? null,
			scheduled_at: start.toISOString(),
			duration_minutes: link.duration_minutes,
			format: 'phone',
			notes: notes || null,
			qualifying_answers: {
				source: 'booking_link',
				booking_link_id: link.id,
				booking_link_slug: link.slug,
				...(link.client_id ? { client_id: link.client_id } : {}),
			},
			status: 'scheduled',
		})
		.select('id')
		.single();

	if (apptErr || !appt) {
		console.error('[booking/book] appointment insert failed:', apptErr?.message);
		return json({ error: 'Could not create appointment' }, { status: 500 });
	}

	// Reminder task for the owner (mirrors /api/appointments convention).
	await supabaseAdmin.from('tasks').insert({
		user_id: link.user_id,
		contact_id: contact.id,
		title: `Appointment with ${name} — ${date} ${time} (${link.timezone})`,
		task_type: 'appointment',
		priority: 'high',
		status: 'pending',
		due_date: new Date(start.getTime() - 60 * 60 * 1000).toISOString(),
	}).then(({ error: e }) => { if (e) console.error('[booking/book] task insert failed:', e.message); });

	// Confirmation emails with ICS — prospect + owner. Awaited (not fire-and-forget)
	// so serverless can't kill the send; failures never fail the booking.
	try {
		let ownerEmail: string | null = null;
		try {
			const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
			ownerEmail = ownerData?.user?.email ?? null;
		} catch { /* owner email unresolvable — send to prospect only */ }

		const whenLocal = new Intl.DateTimeFormat('en-US', {
			timeZone: link.timezone,
			dateStyle: 'full', timeStyle: 'short',
		}).format(start);

		const ics = buildIcs({
			uid: appt.id,
			title: link.title,
			start, end,
			description: `${link.description ?? ''}${notes ? `\nNotes: ${notes}` : ''}`.trim() || undefined,
			organizerEmail: ownerEmail ?? undefined,
			attendeeEmail: email,
		});
		const attachment = {
			filename: 'appointment.ics',
			content: Buffer.from(ics).toString('base64'),
			encoding: 'base64' as const,
			contentType: 'text/calendar; method=REQUEST',
		};

		await sendEmail({
			userId: link.user_id,
			to: email,
			subject: `Confirmed: ${link.title} — ${whenLocal}`,
			html: `<p>Hi ${name},</p><p>Your ${link.duration_minutes}-minute meeting is confirmed.</p>`
				+ `<p><strong>${link.title}</strong><br>${whenLocal} (${link.timezone})</p>`
				+ (notes ? `<p><strong>Your notes:</strong> ${notes}</p>` : '')
				+ `<p>A calendar invite is attached.</p>`,
			attachments: [attachment],
		});

		if (ownerEmail) {
			await sendEmail({
				userId: link.user_id,
				to: ownerEmail,
				subject: `New booking: ${name} — ${whenLocal}`,
				html: `<p><strong>${name}</strong> booked <strong>${link.title}</strong>.</p>`
					+ `<p><strong>When:</strong> ${whenLocal} (${link.timezone})<br>`
					+ `<strong>Email:</strong> ${email}${phone ? `<br><strong>Phone:</strong> ${phone}` : ''}</p>`
					+ (notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''),
				attachments: [attachment],
			});
		}
	} catch (err) {
		console.error('[booking/book] confirmation email failed:', err);
	}

	return json({ ok: true, appointment_id: appt.id });
};
