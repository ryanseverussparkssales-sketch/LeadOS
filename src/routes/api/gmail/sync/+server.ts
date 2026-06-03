import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { getValidToken, fetchNewMessages, parseGmailMessage } from '$lib/server/gmail';
import type { RequestHandler } from './$types';

/**
 * POST /api/gmail/sync
 *
 * Called by:
 *   1. Vercel cron every 5 minutes (Authorization: Bearer $CRON_SECRET)
 *   2. OAuth callback immediately after connect (same auth)
 *   3. User-triggered "Sync Now" button (Authorization: Bearer <supabase JWT>)
 *
 * Body (optional):
 *   { email?: string, userId?: string }
 *   — Omit both to sync ALL gmail accounts (cron mode).
 */

async function syncAllAccounts(targetEmail: string | null, targetUserId: string | null) {
    // ── Load accounts to sync ─────────────────────────────────
    let query = supabaseAdmin
        .from('email_accounts')
        .select(
            'id, user_id, email_address, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, gmail_history_id, last_synced_at'
        )
        .eq('provider', 'gmail')
        .eq('sync_enabled', true);

    if (targetEmail) query = query.eq('email_address', targetEmail);
    if (targetUserId) query = query.eq('user_id', targetUserId);

    const { data: accounts, error: fetchErr } = await query;
    if (fetchErr) {
        console.error('[gmail/sync] query error:', fetchErr.message);
        return json({ error: fetchErr.message }, { status: 500 });
    }
    if (!accounts?.length) return json({ synced: 0, accounts: 0 });

    let totalSynced = 0;
    const errors: string[] = [];

    for (const account of accounts) {
        try {
            const accessToken = await getValidToken(account as any);
            const rawMessages = await fetchNewMessages(account as any, accessToken);

            for (const rawMsg of rawMessages) {
                const parsed = parseGmailMessage(rawMsg);
                if (!parsed) continue;

                // Only handle INBOX messages (skip drafts, spam, etc.)
                if (!parsed.isInbox && !parsed.isSent) continue;
                const direction = parsed.isSent && !parsed.isInbox ? 'outbound' : 'inbound';

                // Deduplicate by Message-ID header
                const { data: existing } = await supabaseAdmin
                    .from('email_logs')
                    .select('id')
                    .eq('message_id', parsed.messageId)
                    .maybeSingle();
                if (existing) continue;

                // Match sender to a contact
                const fromEmail = extractEmail(parsed.from);
                const { data: contact } = await supabaseAdmin
                    .from('contacts')
                    .select('id, name')
                    .eq('user_id', account.user_id)
                    .ilike('email', fromEmail)
                    .is('deleted_at', null)
                    .maybeSingle();

                // Thread grouping key — same logic as inbound webhook
                const threadKey = normalizeThreadKey(parsed.subject);

                // Upsert email_thread row
                const snippet = parsed.textBody.slice(0, 200).replace(/\n/g, ' ').trim();
                const { data: thread } = await supabaseAdmin
                    .from('email_threads')
                    .upsert(
                        {
                            user_id: account.user_id,
                            contact_id: contact?.id ?? null,
                            subject: parsed.subject
                                .replace(/^(Re:|Fwd:|RE:|FWD:|Fw:)\s*/gi, '')
                                .trim(),
                            thread_key: threadKey,
                            last_message_at: parsed.date,
                            last_message_body: snippet,
                            last_message_direction: direction,
                        },
                        { onConflict: 'user_id,thread_key,contact_id' }
                    )
                    .select()
                    .maybeSingle();

                if (thread && direction === 'inbound') {
                    await supabaseAdmin
                        .from('email_threads')
                        .update({
                            unread_count: (thread.unread_count ?? 0) + 1,
                            message_count: (thread.message_count ?? 0) + 1,
                        })
                        .eq('id', thread.id);
                }

                // Insert email_log
                const { error: insertErr } = await supabaseAdmin.from('email_logs').insert({
                    user_id: account.user_id,
                    contact_id: contact?.id ?? null,
                    subject: parsed.subject,
                    body: parsed.textBody,
                    html_body: parsed.htmlBody,
                    from_address: parsed.from,
                    to_address: parsed.to,
                    in_reply_to: parsed.inReplyTo,
                    message_id: parsed.messageId,
                    thread_id: threadKey,
                    email_thread_id: thread?.id ?? null,
                    direction,
                    status: direction === 'outbound' ? 'sent' : 'received',
                    email_type: direction === 'inbound' ? 'inbound' : 'outbound',
                    created_at: parsed.date,
                });

                if (insertErr) {
                    // Duplicate message_id — safe to skip
                    if (insertErr.code !== '23505') {
                        console.error('[gmail/sync] insert error:', insertErr.message);
                    }
                    continue;
                }

                totalSynced++;
            }

            // Update last_synced_at regardless of message count
            await supabaseAdmin
                .from('email_accounts')
                .update({ last_synced_at: new Date().toISOString() })
                .eq('id', account.id);

        } catch (e: any) {
            const msg = `${account.email_address}: ${e?.message ?? String(e)}`;
            console.error('[gmail/sync] error for', msg);
            errors.push(msg);
        }
    }

    return json({
        synced: totalSynced,
        accounts: accounts.length,
        ...(errors.length ? { errors } : {}),
    });
}

/**
 * GET /api/gmail/sync
 * Vercel crons send GET requests with Authorization: Bearer <CRON_SECRET>
 */
export const GET: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('authorization') ?? '';
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }
    return syncAllAccounts(null, null);
};

export const POST: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('authorization') ?? '';
    const isCron = env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`;

    let targetEmail: string | null = null;
    let targetUserId: string | null = null;
    let callerUserId: string | null = null;

    if (isCron) {
        // Cron or server-to-server: may scope to one account or sync all
        const body = await request.json().catch(() => ({}));
        targetEmail = body.email ?? null;
        targetUserId = body.userId ?? null;
    } else {
        // User-triggered: validate JWT and scope to that user only
        const token = authHeader.replace('Bearer ', '');
        if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !data.user) return json({ error: 'Unauthorized' }, { status: 401 });

        callerUserId = data.user.id;
        targetUserId = callerUserId;

        // Allow scoping to a specific email within that user's accounts
        const body = await request.json().catch(() => ({}));
        if (body.email) targetEmail = body.email;
    }

    return syncAllAccounts(targetEmail, targetUserId);
};
