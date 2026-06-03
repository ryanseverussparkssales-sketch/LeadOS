import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { getSpotifyTokens } from '$lib/server/spotify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const tokens = await getSpotifyTokens(user.id);
	if (!tokens) return json({ playlists: [], connected: false });

	const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
		headers: { 'Authorization': `Bearer ${tokens.access_token}` },
	});

	if (!res.ok) return json({ playlists: [], connected: true });

	const data = await res.json();
	const playlists = (data.items ?? []).map((p: any) => ({
		id: p.id,
		name: p.name,
		uri: p.uri,
		tracks: p.tracks?.total ?? 0,
		image: p.images?.[0]?.url ?? null,
		owner: p.owner?.display_name ?? '',
	}));

	return json({ playlists, connected: true, total: data.total });
};
