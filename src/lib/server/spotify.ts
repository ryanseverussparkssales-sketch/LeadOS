import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase';

export async function refreshSpotifyToken(refreshToken: string, userId: string) {
	const auth = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
	});
	if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`);
	const data = await res.json();
	const newTokens = {
		access_token: data.access_token,
		refresh_token: data.refresh_token ?? refreshToken,
		expires_at: Date.now() + data.expires_in * 1000,
		scope: data.scope,
	};
	await supabaseAdmin.from('user_preferences')
		.update({ spotify_tokens: newTokens })
		.eq('user_id', userId);
	return newTokens;
}

export async function getSpotifyTokens(userId: string) {
	const { data: prefs } = await supabaseAdmin
		.from('user_preferences')
		.select('spotify_tokens')
		.eq('user_id', userId)
		.single();
	if (!prefs?.spotify_tokens) return null;
	let tokens = prefs.spotify_tokens as { access_token: string; refresh_token: string; expires_at: number };
	if (Date.now() > tokens.expires_at - 60000) {
		tokens = await refreshSpotifyToken(tokens.refresh_token, userId);
	}
	return tokens;
}
