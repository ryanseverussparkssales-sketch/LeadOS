import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { BRAND } from '$lib/brand';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);

    const { data: account } = await supabaseAdmin
        .from('email_accounts')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', ownerId)
        .single();

    if (!account) return json({ error: 'Account not found' }, { status: 404 });

    try {
        if (account.provider === 'gmail' && account.oauth_access_token) {
            // Test Gmail via API
            const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
                headers: { Authorization: `Bearer ${account.oauth_access_token}` }
            });
            if (res.ok) {
                const profile = await res.json();
                return json({ success: true, email: profile.emailAddress, method: 'gmail' });
            }
            return json({ success: false, error: 'Gmail token expired — reconnect your account' });
        }

        // Test SMTP
        const { sendEmail } = await import('$lib/server/email');
        const result = await sendEmail({
            to: account.email_address,
            subject: `${BRAND} — Connection Test`,
            html: '<p>Your email account is connected and working correctly.</p>',
            text: 'Your email account is connected and working correctly.',
            userId: ownerId,
            accountId: account.id,
        });

        if (result.success) {
            return json({ success: true, email: account.email_address, method: result.method });
        }
        return json({ success: false, error: result.error ?? 'Send failed' });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return json({ success: false, error: msg });
    }
};
