import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BASE = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID ?? ''}`;

const authHeader = () => {
	const creds = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
	return { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' };
};

// GET: search available numbers
// ?type=local|tollfree&areaCode=612&contains=800&limit=20
export const GET: RequestHandler = async ({ request, url }) => {
	await requireAuth(request);
	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw error(400, 'Twilio not configured');

	const type = url.searchParams.get('type') ?? 'local';
	const areaCode = url.searchParams.get('areaCode') ?? '';
	const contains = url.searchParams.get('contains') ?? '';
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 40);

	const endpoint = type === 'tollfree'
		? `${BASE}/AvailablePhoneNumbers/US/TollFree.json`
		: `${BASE}/AvailablePhoneNumbers/US/Local.json`;

	const params = new URLSearchParams({ PageSize: String(limit), VoiceEnabled: 'true' });
	if (areaCode && type === 'local') params.set('AreaCode', areaCode);
	if (contains) params.set('Contains', contains);

	const res = await fetch(`${endpoint}?${params}`, { headers: authHeader() });
	if (!res.ok) {
		const body = await res.text();
		throw error(502, `Twilio search failed: ${body}`);
	}

	const data = await res.json();
	const numbers = (data.available_phone_numbers ?? []).map((n: any) => ({
		phoneNumber: n.phone_number,
		friendlyName: n.friendly_name,
		locality: n.locality,
		region: n.region,
		postalCode: n.postal_code,
		type: type,
		monthlyFee: type === 'tollfree' ? 2.00 : 1.00,
	}));

	return json({ numbers, total: numbers.length });
};

// POST: purchase a number and register it in LeadOS
// Body: { phoneNumber, friendlyName, clientId, campaignId, isPrimary }
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw error(400, 'Twilio not configured');

	const { phoneNumber, friendlyName, clientId, campaignId, isPrimary } = await request.json();
	if (!phoneNumber) throw error(400, 'phoneNumber required');

	const baseUrl = env.PUBLIC_BASE_URL ?? 'https://lead-os-livid.vercel.app';
	const voiceUrl = `${baseUrl}/api/phone/incoming`;
	const statusUrl = `${baseUrl}/api/twilio/status`;

	const purchaseBody = new URLSearchParams({
		PhoneNumber: phoneNumber,
		FriendlyName: friendlyName ?? phoneNumber,
		VoiceUrl: voiceUrl,
		VoiceMethod: 'POST',
		StatusCallback: statusUrl,
		StatusCallbackMethod: 'POST',
		SmsUrl: `${baseUrl}/api/sms/incoming`,
		SmsMethod: 'POST',
	});

	const purchaseRes = await fetch(`${BASE}/IncomingPhoneNumbers.json`, {
		method: 'POST',
		headers: authHeader(),
		body: purchaseBody,
	});

	if (!purchaseRes.ok) {
		const body = await purchaseRes.json();
		throw error(402, body.message ?? 'Purchase failed — check Twilio account balance and number availability');
	}

	const purchased = await purchaseRes.json();

	// If setting as primary, unset all others for this user first
	if (isPrimary) {
		await supabaseAdmin.from('phone_numbers').update({ is_primary: false }).eq('user_id', user.id);
	}

	const { data: phoneRecord, error: dbErr } = await supabaseAdmin
		.from('phone_numbers')
		.insert({
			user_id: user.id,
			phone_number: purchased.phone_number,
			twilio_phone_sid: purchased.sid,
			friendly_name: purchased.friendly_name,
			client_id: clientId ?? null,
			campaign_id: campaignId ?? null,
			voicemail_greeting: 'Please leave a message after the tone.',
			is_primary: isPrimary ?? false,
			status: 'active',
		})
		.select('*, client:clients(name), campaign:campaigns(name)')
		.single();

	if (dbErr) {
		// Purchased from Twilio but DB insert failed — return partial success so caller knows the SID
		return json({
			purchased: true,
			registered: false,
			twilioSid: purchased.sid,
			phoneNumber: purchased.phone_number,
			error: 'Purchased from Twilio but failed to save to LeadOS: ' + dbErr.message,
		}, { status: 207 });
	}

	return json({ purchased: true, registered: true, number: phoneRecord }, { status: 201 });
};

// DELETE: release a number back to Twilio and remove from LeadOS
// ?sid=PNxxx&id=uuid
export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw error(400, 'Twilio not configured');

	const sid = url.searchParams.get('sid');
	const numberId = url.searchParams.get('id');
	if (!sid || !numberId) throw error(400, 'sid and id required');

	// Verify ownership before touching anything
	const { data: num } = await supabaseAdmin
		.from('phone_numbers')
		.select('id')
		.eq('id', numberId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (!num) throw error(403, 'Forbidden');

	// Release from Twilio (best-effort — don't block DB cleanup on Twilio errors)
	try {
		await fetch(`${BASE}/IncomingPhoneNumbers/${sid}.json`, {
			method: 'DELETE',
			headers: authHeader(),
		});
	} catch { /* continue */ }

	await supabaseAdmin.from('phone_numbers').delete().eq('id', numberId).eq('user_id', user.id);

	return json({ ok: true, released: true });
};
