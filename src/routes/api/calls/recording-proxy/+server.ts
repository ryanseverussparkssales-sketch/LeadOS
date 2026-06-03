import { env } from '$env/dynamic/private';
import { requireAuth } from '$lib/server/supabase';

export const GET = async ({ request, url }: { request: Request; url: URL }) => {
	await requireAuth(request);

	const recordingUrl = url.searchParams.get('url');
	if (!recordingUrl) return new Response('No URL', { status: 400 });

	// Only proxy Twilio recording URLs for safety
	if (!recordingUrl.includes('api.twilio.com') && !recordingUrl.includes('twilio.com')) {
		return new Response('Invalid URL', { status: 400 });
	}

	const accountSid = env.TWILIO_ACCOUNT_SID;
	const authToken = env.TWILIO_AUTH_TOKEN;

	if (!accountSid || !authToken) {
		return new Response('Twilio not configured', { status: 500 });
	}

	const upstream = await fetch(recordingUrl, {
		headers: {
			Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
		},
	});

	if (!upstream.ok) {
		return new Response('Recording unavailable', { status: upstream.status });
	}

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
