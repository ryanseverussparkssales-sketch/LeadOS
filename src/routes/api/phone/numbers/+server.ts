import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('phone_numbers')
		.select('*, client:clients(name), campaign:campaigns!phone_numbers_campaign_id_fkey(name)')
		.eq('user_id', user.id)
		.order('is_primary', { ascending: false })
		.order('created_at');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { phoneNumber, friendlyName, clientId, campaignId, twilioPhoneSid, voicemailGreeting, isPrimary } = await request.json();
	if (!phoneNumber) throw error(400, 'phoneNumber required');

	// If setting as primary, unset others
	if (isPrimary) {
		await supabaseAdmin.from('phone_numbers').update({ is_primary: false }).eq('user_id', user.id);
	}

	const { data, error: e } = await supabaseAdmin
		.from('phone_numbers')
		.insert({
			user_id: user.id,
			phone_number: phoneNumber,
			twilio_phone_sid: twilioPhoneSid ?? null,
			friendly_name: friendlyName ?? null,
			client_id: clientId ?? null,
			campaign_id: campaignId ?? null,
			voicemail_greeting: voicemailGreeting ?? 'Please leave a message after the tone.',
			is_primary: isPrimary ?? false,
			status: 'active',
		})
		.select('*, client:clients(name), campaign:campaigns!phone_numbers_campaign_id_fkey(name)')
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};
