import { error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const callId = url.searchParams.get('call_id');
	if (!callId) throw error(400, 'call_id required');

	// Verify this call belongs to the user
	const { data: call } = await supabaseAdmin
		.from('calls')
		.select('recording_url')
		.eq('id', callId)
		.eq('user_id', user.id)
		.single();

	if (!call || !call.recording_url) throw error(404, 'Recording not found');

	// Proxy from Twilio with Basic auth
	const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = env;
	const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

	const audioRes = await fetch(call.recording_url, {
		headers: { Authorization: authHeader },
	});

	if (!audioRes.ok) throw error(502, 'Could not fetch recording from Twilio');

	// Stream back with correct content type
	const headers = new Headers({
		'Content-Type': 'audio/mpeg',
		'Cache-Control': 'private, max-age=3600',
	});

	const contentLength = audioRes.headers.get('Content-Length');
	if (contentLength) headers.set('Content-Length', contentLength);

	return new Response(audioRes.body, { headers });
};
