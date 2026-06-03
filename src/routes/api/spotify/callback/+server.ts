import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const getRedirectUri = () => env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/api/spotify/callback`
    : 'https://lead-os-livid.vercel.app/api/spotify/callback';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state'); // this is the nonce only
	const callbackError = url.searchParams.get('error');

	if (callbackError) throw redirect(302, `/dashboard?spotify_error=${callbackError}`);
	if (!code || !state) throw redirect(302, '/dashboard?spotify_error=missing_params');

	// Read auth data from cookie — never from URL params
	let authCookie: { nonce: string; userId: string } | null = null;
	try {
		const raw = cookies.get('spotify_auth');
		if (raw) authCookie = JSON.parse(raw);
	} catch {
		throw redirect(302, '/dashboard?spotify_error=invalid_cookie');
	}

	cookies.delete('spotify_auth', { path: '/' });

	if (!authCookie || authCookie.nonce !== state) {
		throw redirect(302, '/dashboard?spotify_error=state_mismatch');
	}

	const userId = authCookie.userId;
	if (!userId) throw redirect(302, '/dashboard?spotify_error=no_user');

	// Exchange code for tokens
	const auth = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
	const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: getRedirectUri() }),
	});

	if (!tokenRes.ok) {
		const body = await tokenRes.text();
		console.error('[spotify/callback] token exchange failed:', body);
		throw redirect(302, '/dashboard?spotify_error=token_exchange_failed');
	}

	const tokens = await tokenRes.json();

	await supabaseAdmin.from('user_preferences').upsert({
		user_id: userId,
		spotify_tokens: {
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expires_at: Date.now() + tokens.expires_in * 1000,
			scope: tokens.scope,
		},
	}, { onConflict: 'user_id' });

	throw redirect(302, '/dashboard?spotify=connected');
};
