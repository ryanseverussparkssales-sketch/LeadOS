import { json, error } from '@sveltejs/kit';
import { rateLimitUser } from '$lib/server/rateLimit';
import { requireAuth } from '$lib/server/supabase';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from '$env/static/private';
import type { RequestHandler } from './$types';

// Fetches real Twilio usage from the Usage Records API
// Docs: https://www.twilio.com/docs/usage/api/usage-record
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	if (await rateLimitUser(user.id, { max: 30, windowMs: 60_000 })) throw error(429, "Rate limit exceeded — max 30 AI requests/minute");
	void user; // auth check only

	if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
		throw error(400, 'Twilio credentials not configured');
	}

	const range = url.searchParams.get('range') ?? 'ThisMonth';
	// Supported: Today | Yesterday | ThisMonth | LastMonth | AllTime
	const validRanges = ['Today', 'Yesterday', 'ThisMonth', 'LastMonth', 'AllTime'];
	if (!validRanges.includes(range)) throw error(400, 'Invalid range');

	const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

	// Fetch all usage records for this period
	const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Usage/Records/${range}.json?PageSize=100`;

	let resp: Response;
	try {
		resp = await fetch(twilioUrl, {
			headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
		});
	} catch (e: any) {
		throw error(502, `Twilio unreachable: ${e.message}`);
	}

	if (!resp.ok) {
		const txt = await resp.text();
		throw error(resp.status, `Twilio error: ${txt}`);
	}

	const raw = await resp.json();
	const records: any[] = raw.usage_records ?? [];

	// Pull out the categories we care about
	const categories = [
		'calls', 'calls-outbound', 'calls-inbound', 'calls-client',
		'sms', 'sms-outbound', 'sms-inbound',
		'recordings', 'transcriptions',
		'phonenumbers', 'phonenumbers-local',
	];

	const usage: Record<string, { count: string; usage: string; price: string; unit: string }> = {};
	for (const r of records) {
		if (categories.includes(r.category)) {
			usage[r.category] = {
				count: r.count ?? '0',
				usage: r.usage ?? '0',
				price: r.price ?? '0',
				unit: r.usage_unit ?? '',
			};
		}
	}

	// Aggregate totals
	const totalCost = records.reduce((s, r) => s + parseFloat(r.price ?? '0'), 0);
	const callMinutes = parseFloat(usage['calls']?.usage ?? '0');
	const callCost = parseFloat(usage['calls']?.price ?? '0');
	const smsSent = parseInt(usage['sms-outbound']?.count ?? '0', 10);
	const smsReceived = parseInt(usage['sms-inbound']?.count ?? '0', 10);
	const smsCost = parseFloat(usage['sms']?.price ?? '0');
	const recordingCost = parseFloat(usage['recordings']?.price ?? '0');

	return json({
		range,
		totalCost: totalCost.toFixed(4),
		callMinutes: callMinutes.toFixed(1),
		callCost: callCost.toFixed(4),
		smsSent,
		smsReceived,
		smsCost: smsCost.toFixed(4),
		recordingCost: recordingCost.toFixed(4),
		breakdown: usage,
		raw: records.map(r => ({ category: r.category, count: r.count, usage: r.usage, price: r.price, unit: r.usage_unit })),
	});
};
