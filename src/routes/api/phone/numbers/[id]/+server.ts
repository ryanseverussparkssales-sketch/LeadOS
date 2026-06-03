import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	if (body.is_primary) {
		await supabaseAdmin.from('phone_numbers').update({ is_primary: false }).eq('user_id', user.id);
	}
	const { data, error: e } = await supabaseAdmin
		.from('phone_numbers').update(body).eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(400, e.message);

	// Sync Twilio webhooks if forwarding or SMS settings changed and a SID is present
	const num = data as { twilio_phone_sid?: string; sms_enabled?: boolean };
	const twilioFields = ['forwarding_enabled', 'forwarding_number', 'sms_enabled'];
	const hasTwilioChange = twilioFields.some(f => f in body);

	if (num.twilio_phone_sid && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && hasTwilioChange) {
		const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
		const baseUrl = env.PUBLIC_BASE_URL ?? 'https://lead-os-livid.vercel.app';

		const twilioBody = new URLSearchParams({
			VoiceUrl: `${baseUrl}/api/phone/incoming`,
			VoiceMethod: 'POST',
			StatusCallback: `${baseUrl}/api/twilio/status`,
			StatusCallbackMethod: 'POST',
		});

		// Only set SMS webhook if sms_enabled is not explicitly false
		if (body.sms_enabled !== false && num.sms_enabled !== false) {
			twilioBody.set('SmsUrl', `${baseUrl}/api/sms/incoming`);
			twilioBody.set('SmsMethod', 'POST');
		} else {
			twilioBody.set('SmsUrl', '');
		}

		await fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${num.twilio_phone_sid}.json`,
			{
				method: 'POST',
				headers: {
					'Authorization': `Basic ${auth}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: twilioBody,
			}
		).catch(err => console.error('[phone/numbers] Twilio sync failed:', err));
	}

	return json(data);
};

// PATCH — lightweight increment of calls_today (called from the dialer on each dial)
export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	return json({ success: true });
};
