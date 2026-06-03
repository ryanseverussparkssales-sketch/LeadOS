import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { getSpotifyTokens } from '$lib/server/spotify';
import type { RequestHandler } from './$types';

type Action = 'play' | 'pause' | 'next' | 'previous' | 'volume' | 'seek' | 'context';

async function getActiveDeviceId(headers: Record<string, string>): Promise<string | null> {
	const devRes = await fetch('https://api.spotify.com/v1/me/player/devices', { headers });
	if (!devRes.ok) return null;
	const devData = await devRes.json();
	const devices = devData.devices ?? [];
	const active = devices.find((d: any) => d.is_active) ?? devices[0];
	return active?.id ?? null;
}

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { action, value, contextUri } = await request.json() as { action: Action; value?: number; contextUri?: string };

	const tokens = await getSpotifyTokens(user.id);
	if (!tokens) throw error(401, 'Spotify not connected');

	const headers = { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' };

	switch (action) {
		case 'play': {
			const deviceId = await getActiveDeviceId(headers);
			let url = 'https://api.spotify.com/v1/me/player/play';
			if (deviceId) url += `?device_id=${deviceId}`;
			const playRes = await fetch(url, {
				method: 'PUT',
				headers,
				body: JSON.stringify({}),
			});
			if (!playRes.ok && playRes.status !== 204) {
				const body = await playRes.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${playRes.status} - ${body}` });
			}
			return json({ ok: true });
		}

		case 'context': {
			const deviceId = await getActiveDeviceId(headers);
			let playUrl = 'https://api.spotify.com/v1/me/player/play';
			if (deviceId) playUrl += `?device_id=${deviceId}`;
			const playRes = await fetch(playUrl, {
				method: 'PUT',
				headers,
				body: JSON.stringify({ context_uri: contextUri }),
			});
			if (!playRes.ok && playRes.status !== 204) {
				const body = await playRes.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${playRes.status} - ${body}` });
			}
			return json({ ok: true });
		}

		case 'pause': {
			const res = await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers });
			if (!res.ok && res.status !== 204) {
				const body = await res.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${res.status} - ${body}` });
			}
			return json({ ok: true });
		}

		case 'next': {
			const res = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
			if (!res.ok && res.status !== 204) {
				const body = await res.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${res.status} - ${body}` });
			}
			return json({ ok: true });
		}

		case 'previous': {
			const res = await fetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST', headers });
			if (!res.ok && res.status !== 204) {
				const body = await res.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${res.status} - ${body}` });
			}
			return json({ ok: true });
		}

		case 'volume': {
			const vol = Math.round(Math.max(0, Math.min(100, value ?? 50)));
			const res = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}`, { method: 'PUT', headers });
			if (!res.ok && res.status !== 204) {
				const body = await res.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${res.status} - ${body}` });
			}
			return json({ ok: true });
		}

		case 'seek': {
			const pos = Math.round(Math.max(0, value ?? 0));
			const res = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${pos}`, { method: 'PUT', headers });
			if (!res.ok && res.status !== 204) {
				const body = await res.text().catch(() => '');
				return json({ ok: false, error: `Spotify: ${res.status} - ${body}` });
			}
			return json({ ok: true });
		}

		default:
			return json({ ok: false, error: 'Unknown action' }, { status: 400 });
	}
};
