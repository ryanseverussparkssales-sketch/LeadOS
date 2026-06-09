import { env } from '$env/dynamic/private';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';

/**
 * Streams a call recording from Twilio with the platform's Basic-auth creds.
 *
 * SECURITY: accepts ONLY a `call_id` (never a raw URL). The recording URL is
 * resolved from the user's OWN calls row. Previously this route proxied any
 * caller-supplied twilio.com URL using the master account token, which let any
 * authenticated user read every tenant's recordings and hit arbitrary Twilio
 * REST endpoints (cross-tenant data exposure + credentialed SSRF).
 */
export const GET = async ({ request, url }: { request: Request; url: URL }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const callId = url.searchParams.get('call_id');
	if (!callId) return new Response('call_id required', { status: 400 });

	// Resolve the recording URL from a row the caller actually owns.
	const { data: call } = await supabaseAdmin
		.from('calls')
		.select('recording_url')
		.eq('id', callId)
		.eq('user_id', ownerId)
		.maybeSingle();

	if (!call?.recording_url) return new Response('Recording not found', { status: 404 });

	// Defense in depth: only ever fetch a twilio.com host.
	let recordingUrl = call.recording_url as string;
	try {
		const host = new URL(recordingUrl).hostname;
		if (!host.endsWith('twilio.com')) return new Response('Invalid recording host', { status: 400 });
	} catch {
		return new Response('Invalid recording URL', { status: 400 });
	}

	const accountSid = env.TWILIO_ACCOUNT_SID;
	const authToken = env.TWILIO_AUTH_TOKEN;
	if (!accountSid || !authToken) return new Response('Twilio not configured', { status: 500 });

	const upstream = await fetch(recordingUrl, {
		headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
	});

	if (!upstream.ok) return new Response('Recording unavailable', { status: upstream.status });

	const contentType = upstream.headers.get('Content-Type') ?? 'audio/mpeg';
	const body = await upstream.arrayBuffer();

	return new Response(body, {
		headers: {
			'Content-Type': contentType,
			'Content-Length': String(body.byteLength),
			'Cache-Control': 'private, max-age=3600',
			'Accept-Ranges': 'bytes',
		},
	});
};
