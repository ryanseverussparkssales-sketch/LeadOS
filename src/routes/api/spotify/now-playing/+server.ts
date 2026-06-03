import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { getSpotifyTokens } from '$lib/server/spotify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	const tokens = await getSpotifyTokens(user.id);
	if (!tokens) return json({ connected: false });

	// Fetch currently playing
	const npRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
		headers: { 'Authorization': `Bearer ${tokens.access_token}` },
	});

	if (npRes.status === 204 || !npRes.ok) {
		// Nothing playing — try recently played
		const rpRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
			headers: { 'Authorization': `Bearer ${tokens.access_token}` },
		});
		if (rpRes.ok) {
			const rp = await rpRes.json();
			const item = rp.items?.[0]?.track;
			if (item) return json({
				connected: true,
				playing: false,
				track: {
					name: item.name,
					artist: item.artists.map((a: any) => a.name).join(', '),
					album: item.album.name,
					image: item.album.images?.[0]?.url,
					id: item.id,
				},
				bpm: 120, energy: 0.5, valence: 0.5,
			});
		}
		return json({ connected: true, playing: false });
	}

	const np = await npRes.json();
	const item = np.item;
	if (!item) return json({ connected: true, playing: false });

	// Fetch audio features for BPM
	let bpm = 120, energy = 0.7, valence = 0.5, danceability = 0.6;
	try {
		const afRes = await fetch(`https://api.spotify.com/v1/audio-features/${item.id}`, {
			headers: { 'Authorization': `Bearer ${tokens.access_token}` },
		});
		if (afRes.ok) {
			const af = await afRes.json();
			bpm = Math.round(af.tempo);
			energy = af.energy;
			valence = af.valence;
			danceability = af.danceability;
		}
	} catch {}

	return json({
		connected: true,
		playing: np.is_playing,
		progress_ms: np.progress_ms,
		duration_ms: item.duration_ms,
		track: {
			name: item.name,
			artist: item.artists.map((a: any) => a.name).join(', '),
			album: item.album.name,
			image: item.album.images?.[0]?.url,
			id: item.id,
		},
		bpm,
		energy,
		valence,
		danceability,
	});
};
