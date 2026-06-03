import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const getRedirectUri = () =>
    `${env.PUBLIC_SITE_URL ?? env.PUBLIC_BASE_URL ?? 'https://lead-os-livid.vercel.app'}/auth/gmail/callback`;

const getSiteUrl = () =>
    env.PUBLIC_SITE_URL ?? env.PUBLIC_BASE_URL ?? 'https://lead-os-livid.vercel.app';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    // Read auth cookie
    let authCookie: { nonce: string; userId: string } | null = null;
    try {
        const raw = cookies.get('gmail_oauth');
        if (raw) authCookie = JSON.parse(raw);
    } catch { /* malformed */ }

    const label = cookies.get('gmail_oauth_label') ?? 'Gmail';

    // Clear cookies unconditionally
    cookies.delete('gmail_oauth', { path: '/' });
    cookies.delete('gmail_oauth_label', { path: '/' });

    if (oauthError) {
        console.warn('[gmail/callback] OAuth error from Google:', oauthError);
        throw redirect(302, `/settings?gmail_error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state || !authCookie) {
        throw redirect(302, '/settings?gmail_error=missing_params');
    }

    // CSRF check: state must match the nonce we stored
    if (authCookie.nonce !== state) {
        console.error('[gmail/callback] CSRF nonce mismatch');
        throw redirect(302, '/settings?gmail_error=state_mismatch');
    }

    const userId = authCookie.userId;

    // ── Exchange code for tokens ──────────────────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: getRedirectUri(),
            grant_type: 'authorization_code',
        }),
    });

    if (!tokenRes.ok) {
        console.error('[gmail/callback] token exchange failed:', await tokenRes.text());
        throw redirect(302, '/settings?gmail_error=token_failed');
    }

    const tokens = await tokenRes.json();
    const { access_token, refresh_token, expires_in, scope } = tokens;

    if (!access_token) {
        throw redirect(302, '/settings?gmail_error=no_access_token');
    }

    // ── Fetch Google profile to get email address ─────────────
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileRes.ok) {
        console.error('[gmail/callback] userinfo fetch failed:', await profileRes.text());
        throw redirect(302, '/settings?gmail_error=no_profile');
    }

    const profile = await profileRes.json();
    const gmailAddress = profile?.email ?? null;
    const googleAccountId = profile?.sub ?? null;

    if (!gmailAddress) {
        throw redirect(302, '/settings?gmail_error=no_email');
    }

    const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString();
    const scopes = (scope ?? '').split(' ').filter(Boolean);

    // ── Upsert email_account record ───────────────────────────
    // smtp_* columns are nullable for OAuth accounts
    const { error: upsertError } = await supabaseAdmin
        .from('email_accounts')
        .upsert(
            {
                user_id: userId,
                label,
                email_address: gmailAddress,
                // smtp fields optional for OAuth accounts
                smtp_host: 'oauth.gmail.com',
                smtp_port: 587,
                smtp_user: gmailAddress,
                smtp_password_encrypted: null,
                provider: 'gmail',
                oauth_access_token: access_token,
                oauth_refresh_token: refresh_token ?? null,
                oauth_token_expires_at: expiresAt,
                oauth_scopes: scopes,
                google_account_id: googleAccountId,
                sync_enabled: true,
                last_synced_at: null,
                is_active: true,
                is_default: false,
            },
            { onConflict: 'user_id,email_address' }
        );

    if (upsertError) {
        console.error('[gmail/callback] upsert error:', upsertError.message);
        throw redirect(302, '/settings?gmail_error=save_failed');
    }

    // ── Trigger initial sync fire-and-forget ──────────────────
    const cronSecret = env.CRON_SECRET;
    if (cronSecret) {
        fetch(`${getSiteUrl()}/api/gmail/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cronSecret}`,
            },
            body: JSON.stringify({ email: gmailAddress, userId }),
        }).catch((e) => console.error('[gmail/callback] initial sync trigger failed:', e));
    }

    throw redirect(302, `/settings?gmail_connected=${encodeURIComponent(gmailAddress)}#email-accounts`);
};
