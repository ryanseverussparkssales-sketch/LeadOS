import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const TWILIO_AUTH = () => Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
const HEADERS = () => ({ 'Authorization': `Basic ${TWILIO_AUTH()}` });

// GET: fetch A2P brand + campaign + number status from Twilio
export const GET: RequestHandler = async ({ request }) => {
	await requireAuth(request);
	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
		return json({ configured: false, error: 'Twilio not configured' });
	}

	try {
		// Fetch brand registrations
		const brandRes = await fetch(
			'https://messaging.twilio.com/v1/a2p/BrandRegistrations?PageSize=10',
			{ headers: HEADERS() }
		);
		const brandData = brandRes.ok ? await brandRes.json() : { data: [] };

		// Fetch messaging services (campaigns)
		const servicesRes = await fetch(
			`https://messaging.twilio.com/v1/Services?PageSize=20`,
			{ headers: HEADERS() }
		);
		const servicesData = servicesRes.ok ? await servicesRes.json() : { services: [] };

		// Fetch phone numbers currently registered for A2P
		const numbersRes = await fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PageSize=50`,
			{ headers: HEADERS() }
		);
		const numbersData = numbersRes.ok ? await numbersRes.json() : { incoming_phone_numbers: [] };

		const brands = brandData.data ?? [];
		const services = servicesData.services ?? [];
		const numbers = numbersData.incoming_phone_numbers ?? [];

		// Map brand statuses
		const brandStatus = brands.map((b: any) => ({
			sid: b.sid,
			brandName: b.identity_status !== 'UNVERIFIED' ? b.company_name ?? 'Registered' : 'Unverified',
			status: b.status, // PENDING, APPROVED, FAILED
			failureReason: b.failure_reason ?? null,
			identityStatus: b.identity_status,
		}));

		// Map campaign statuses
		const campaigns = services.map((s: any) => ({
			sid: s.sid,
			name: s.friendly_name,
			status: 'active',
			usecase: s.usecase ?? 'mixed',
		}));

		// Map number CNAM names
		const numberDetails = numbers.map((n: any) => ({
			phoneNumber: n.phone_number,
			sid: n.sid,
			friendlyName: n.friendly_name,
			callerIdName: n.caller_id_name ?? null,
			smsCapable: n.capabilities?.sms ?? false,
			voiceCapable: n.capabilities?.voice ?? false,
		}));

		// Overall registration status
		const hasApprovedBrand = brandStatus.some((b: any) => b.status === 'APPROVED');
		const hasCampaign = campaigns.length > 0;
		const overallStatus = hasApprovedBrand && hasCampaign ? 'registered'
			: brands.length > 0 ? 'pending'
			: 'unregistered';

		return json({
			configured: true,
			overallStatus,
			brands: brandStatus,
			campaigns,
			numbers: numberDetails,
			registrationUrl: 'https://console.twilio.com/us1/develop/sms/a2p-registration',
		});
	} catch (err) {
		console.error('[a2p-status] Error:', err);
		return json({ configured: true, error: 'Failed to fetch Twilio registration status' });
	}
};

// POST: set CNAM caller ID name on a specific number
// Body: { phoneSid: string, callerIdName: string }
export const POST: RequestHandler = async ({ request }) => {
	await requireAuth(request);
	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw error(400, 'Twilio not configured');

	const { phoneSid, callerIdName } = await request.json();
	if (!phoneSid || !callerIdName) throw error(400, 'phoneSid and callerIdName required');

	// CNAM: max 15 chars, alphanumeric + spaces only
	const cleaned = callerIdName.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 15).trim();

	const res = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${phoneSid}.json`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Basic ${TWILIO_AUTH()}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({ CallerIdName: cleaned }),
		}
	);

	if (!res.ok) {
		const body = await res.json();
		throw error(400, body.message ?? 'Failed to set caller ID name');
	}

	const updated = await res.json();
	return json({ ok: true, callerIdName: updated.caller_id_name, phoneSid });
};
