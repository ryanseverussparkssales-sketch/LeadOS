import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAuth } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const getRedirectUri = () =>
    `${env.PUBLIC_SITE_URL ?? env.PUBLIC_BASE_URL ?? 'https://lead-os-livid.vercel.app'}/auth/gmail/callback`;

export const GET: RequestHandler = async ({ request, url, cookies }) => {
    if (!env.GOOGLE_CLIENT_ID) {
        throw redirect(302, '/settings?gmail_error=not_configured');
    }

    const user = await requireAuth(request);

    // Store user ID in a short-lived secure cookie — never trust URL state for identity
    const nonce = crypto.randomUUID();
    cookies.set('gmail_oauth', JSON.stringify({ nonce, userId: user.id }), {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
    });

    // Optional display label passed from the "Connect Gmail" button
    const label = url.searchParams.get('label') ?? 'Gmail';
    cookies.set('gmail_oauth_label', label, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 600,
    });

    const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: getRedirectUri(),
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',       // required to get a refresh_token
        prompt: 'consent',             // always show consent screen so we always get refresh_token
        include_granted_scopes: 'true',
        state: nonce,                  // CSRF protection — verified in callback
    });

    throw redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
