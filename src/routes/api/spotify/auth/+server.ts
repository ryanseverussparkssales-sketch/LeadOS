import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAuth } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const SCOPES = 'user-read-currently-playing user-read-playback-state user-read-recently-played user-modify-playback-state';
// Use env var for redirect URI, fall back to production URL
const getRedirectUri = () => env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/api/spotify/callback`
    : 'https://lead-os-livid.vercel.app/api/spotify/callback';

export const GET: RequestHandler = async ({ request, cookies }) => {
	if (!env.SPOTIFY_CLIENT_ID) throw error(500, 'SPOTIFY_CLIENT_ID not configured');

	const user = await requireAuth(request);

	const nonce = crypto.randomUUID(); // cryptographically random, not Math.random

	// Store BOTH nonce AND userId in the cookie — never trust state param for identity
	cookies.set('spotify_auth', JSON.stringify({ nonce, userId: user.id }), {
		path: '/',
		httpOnly: true,
		maxAge: 600,
		sameSite: 'lax',
		secure: true,
	});

	const params = new URLSearchParams({
		client_id: env.SPOTIFY_CLIENT_ID,
		response_type: 'code',
		redirect_uri: getRedirectUri(),
		scope: SCOPES,
		state: nonce, // state only carries the nonce, NOT userId
	});

	return json({ url: `https://accounts.spotify.com/authorize?${params}` });
};
