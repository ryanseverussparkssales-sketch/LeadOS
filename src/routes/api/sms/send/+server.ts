import { json, error } from '@sveltejs/kit';
import { rateLimitUser } from '$lib/server/rateLimit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { getTwilioCreds, twilioBasicAuth } from '$lib/server/twilio';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	if (await rateLimitUser(user.id, { max: 30, windowMs: 60000 })) throw error(429, "Rate limit exceeded — slow down");
	const ownerId = await getEffectiveUserId(user.id);
	const creds = await getTwilioCreds(user.id);
	if (!creds.hasRest) throw error(500, 'Twilio credentials not configured');
	const { to, body, contactId, fromNumber } = await request.json();
	if (!to || !body) throw error(400, 'to and body required');

	// Resolve template variables {{name}}, {{company}}, {{phone}}, {{email}}, {{title}}
	let resolvedBody = body;
	if (contactId && /\{\{/.test(body)) {
		const { data: contact } = await supabaseAdmin
			.from('contacts').select('name, company, phone, email, title').eq('id', contactId).single();
		if (contact) {
			resolvedBody = body
				.replace(/\{\{name\}\}/gi, contact.name ?? '')
				.replace(/\{\{company\}\}/gi, contact.company ?? '')
				.replace(/\{\{phone\}\}/gi, contact.phone ?? '')
				.replace(/\{\{email\}\}/gi, contact.email ?? '')
				.replace(/\{\{title\}\}/gi, contact.title ?? '');
		}
	}

	const from = fromNumber ?? creds.phoneNumber;
	if (!from) throw error(500, 'No from number configured');

	// Send via Twilio SMS REST API
	const formData = new URLSearchParams({ To: to, From: from, Body: resolvedBody });
	const res = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
		{
			method: 'POST',
			headers: {
				Authorization: twilioBasicAuth(creds),
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: formData.toString(),
		}
	);

	if (!res.ok) {
		const err = await res.json() as { message: string };
		throw error(502, err.message ?? 'Twilio SMS failed');
	}

	const twilioData = await res.json() as { sid: string; status: string };

	// Log the SMS
	const { data: log } = await supabaseAdmin.from('sms_logs').insert({
		user_id: ownerId,
		contact_id: contactId ?? null,
		from_number: from,
		to_number: to,
		body,
		direction: 'outbound',
		status: twilioData.status,
		twilio_sid: twilioData.sid,
	}).select().single();

	return json({ success: true, log });
};
