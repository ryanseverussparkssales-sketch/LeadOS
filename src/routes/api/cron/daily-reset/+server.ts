/**
 * SETUP REQUIRED:
 * Add to Vercel Environment Variables:
 *   CRON_SECRET = <any random secret string, e.g. openssl rand -hex 32>
 *   PUBLIC_SITE_URL = https://your-vercel-deployment-url.vercel.app
 *
 * Vercel automatically passes Authorization: Bearer <CRON_SECRET> on cron calls.
 * Schedule: daily at 00:00 UTC (configured in vercel.json)
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';

// This endpoint is called by Vercel Cron at midnight UTC
// Protected by CRON_SECRET env var
export const GET = async ({ request }: { request: Request }) => {
    // Verify this is a legitimate Vercel cron call
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: Record<string, unknown> = {};
    const errors: string[] = [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // ── 0. Reset phone_numbers.calls_today ────────────────────────────────
    try {
        const { error: numResetError, count: numCount } = await supabaseAdmin
            .from('phone_numbers')
            .update({ calls_today: 0 })
            .neq('calls_today', 0);
        if (numResetError) throw numResetError;
        results.phone_numbers_reset = numCount ?? 0;
    } catch (e: any) {
        errors.push(`phone_numbers reset: ${e.message}`);
    }

    // ── 1. Reset campaigns.calls_today for all campaigns ──────────────────
    try {
        const { error: callsResetError, count } = await supabaseAdmin
            .from('campaigns')
            .update({ calls_today: 0, last_reset_date: today })
            .neq('calls_today', 0)          // only update rows that need it
            .is('deleted_at', null);

        if (callsResetError) throw callsResetError;
        results.campaigns_reset = count ?? 0;
    } catch (e: any) {
        errors.push(`campaigns reset: ${e.message}`);
    }

    // ── 2. Reset lead_sources.leads_today ────────────────────────────────
    try {
        const { error: leadsResetError, count } = await supabaseAdmin
            .from('lead_sources')
            .update({ leads_today: 0 })
            .neq('leads_today', 0);

        if (leadsResetError) throw leadsResetError;
        results.lead_sources_reset = count ?? 0;
    } catch (e: any) {
        errors.push(`lead_sources reset: ${e.message}`);
    }

    // ── 3. Reset campaign_goals rows with period = 'daily' ────────────────
    try {
        const { error: goalsResetError, count } = await supabaseAdmin
            .from('campaign_goals')
            .update({ current_value: 0, last_reset: today })
            .eq('period', 'daily');

        if (goalsResetError) throw goalsResetError;
        results.campaign_goals_reset = count ?? 0;
    } catch (e: any) {
        // campaign_goals may not have current_value column yet — non-fatal
        console.warn('[cron/daily-reset] campaign_goals reset skipped:', e.message);
    }

    // ── 4. Trigger batch contact scoring (background, non-blocking) ───────
    // Fire and forget — don't await, just kick it off
    supabaseAdmin
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .then(({ count }) => {
            if ((count ?? 0) > 0) {
                // The scoring endpoint scores 500 at a time — kick it off via a self-call
                // This runs in the background after the cron response is sent
                fetch(`${env.PUBLIC_SITE_URL ?? 'https://leadosuite.vercel.app'}/api/contacts/score`, {
                    method: 'GET',
                    headers: { authorization: `Bearer ${env.CRON_SECRET}` }
                }).catch(e => console.error('[cron] scoring trigger failed:', e));
            }
        });

    // ── 5. Cleanup expired rate limit counters ────────────────────────────
    try {
        await supabaseAdmin.rpc('cleanup_rate_limits');
        results.rate_limits_cleaned = true;
	return json({ success: true });
};
