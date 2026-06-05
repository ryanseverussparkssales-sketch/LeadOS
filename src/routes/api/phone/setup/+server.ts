import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// POST /api/phone/setup — seeds the primary number from TWILIO_PHONE_NUMBER env var
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { TWILIO_PHONE_NUMBER } = env;

	if (!TWILIO_PHONE_NUMBER) {
		return json({ error: 'TWILIO_PHONE_NUMBER not set in .env.local' }, { status: 400 });
	}

	// Check if already exists
	const { data: existing } = await supabaseAdmin
		.from('phone_numbers')
		.select('id')
		.eq('user_id', user.id)
		.eq('phone_number', TWILIO_PHONE_NUMBER)
		.maybeSingle();

	if (existing) {
		return json({ message: 'Number already registered', id: existing.id });
	}

	// Unset any existing primary
	await supabaseAdmin.from('phone_numbers').update({ is_primary: false }).eq('user_id', user.id);

	const { data, error } = await supabaseAdmin
		.from('phone_numbers')
		.insert({
			user_id: user.id,
			phone_number: TWILIO_PHONE_NUMBER,
			friendly_name: 'Primary (from .env)',
			is_primary: true,
			status: 'active',
			voicemail_greeting: 'Hi, you\'ve reached Edelhaus. Please leave a message after the tone.',
			record_incoming: true,
		})
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 400 });
	return json({ created: true, number: data });
};
