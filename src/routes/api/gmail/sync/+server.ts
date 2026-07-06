import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { getValidToken, fetchNewMessages, parseGmailMessage } from '$lib/server/gmail';
import type { RequestHandler } from './$types';

// Thread grouping + address parsing — mirrors the inbound email webhook.
function normalizeThreadKey(subject: string): string {
	return (subject ?? '')
		.replace(/^(Re:|Fwd:|RE:|FWD:|Fw:)\s*/gi, '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function extractEmail(address: string): string {
	const a = address ?? '';
	const match = a.match(/<([^>]+)>/) ?? a.match(/([^\s,]+@[^\s,]+)/);
	return (match?.[1] ?? a).toLowerCase().trim();
}

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

    // Cursor fairness: least-recently-synced first (never-synced before that),
    // bounded so one run can't load an unbounded account list. last_synced_at
    // is only touched when an account's sync completes, so accounts skipped by
    // the time-box below sort to the front of the next run.
    query = query
        .order('last_synced_at', { ascending: true, nullsFirst: true })
        .limit(50);

    const { data: accounts, error: fetchErr } = await query;
    if (fetchErr) {
        console.error('[gmail/sync] query error:', fetchErr.message);
        return json({ error: fetchErr.message }, { status: 500 });
    }
    if (!accounts?.length) return json({ synced: 0, accounts: 0 });

    let totalSynced = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Time-box: stop STARTING new accounts after 45s (Vercel cron budget).
    // Skipped accounts keep their old last_synced_at, so they lead the next run.
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 45_000;

    for (const account of accounts) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
            skipped++;
            continue;
        }
        try {
            const accessToken = await getValidToken(account as any);
            const rawMessages = await fetchNewMessages(account as any, accessToken);

            // ── Batched sync (was ~5 serial DB queries PER message — an N+1 that
            // timed out the 5-min cron at scale). Now: 1 dedup query + 1 contact
            // match + one upsert/update per *thread* + one bulk insert per account.
            const touchSynced = async () => {
                await supabaseAdmin.from('email_accounts')
                    .update({ last_synced_at: new Date().toISOString() }).eq('id', account.id);
            };
            const dirOf = (p: { isSent: boolean; isInbox: boolean }) =>
                p.isSent && !p.isInbox ? 'outbound' : 'inbound';

            const parsed = rawMessages
                .map((m) => parseGmailMessage(m))
                .filter((p): p is NonNullable<ReturnType<typeof parseGmailMessage>> =>
                    !!p && (p.isInbox || p.isSent));
            if (!parsed.length) { await touchSynced(); continue; }

            // 1 query: which Message-IDs already exist → skip them
            const msgIds = [...new Set(parsed.map((p) => p.messageId).filter(Boolean))];
            const { data: existingRows } = msgIds.length
                ? await supabaseAdmin.from('email_logs').select('message_id').in('message_id', msgIds)
                : { data: [] as { message_id: string }[] };
            const existing = new Set((existingRows ?? []).map((r) => r.message_id));
            const fresh = parsed.filter((p) => !existing.has(p.messageId));
            if (!fresh.length) { await touchSynced(); continue; }

            // 1 query: match all senders to contacts (case-insensitive, like the original)
            const fromEmails = [...new Set(fresh.map((p) => extractEmail(p.from)).filter(Boolean))];
            const contactByEmail = new Map<string, { id: string; name: string }>();
            if (fromEmails.length) {
                const { data: contactRows } = await supabaseAdmin
                    .from('contacts')
                    .select('id, name, email')
                    .eq('user_id', account.user_id)
                    .is('deleted_at', null)
                    .or(fromEmails.map((e) => `email.ilike.${e}`).join(','));
                for (const c of contactRows ?? []) {
                    const k = (c.email ?? '').toLowerCase();
                    if (k && !contactByEmail.has(k)) contactByEmail.set(k, { id: c.id, name: c.name });
                }
            }
            const contactFor = (p: { from: string }) =>
                contactByEmail.get(extractEmail(p.from)) ?? null;

            // Group messages into threads (oldest → newest so the latest wins on last_message_*)
            const ordered = [...fresh].sort((a, b) => +new Date(a.date) - +new Date(b.date));
            interface Grp {
                user_id: string; contact_id: string | null; subject: string; thread_key: string;
                last_message_at: string; last_message_body: string; last_message_direction: string;
                inbound: number; // original incremented unread_count AND message_count by inbound only
            }
            const groups = new Map<string, Grp>();
            for (const p of ordered) {
                const c = contactFor(p);
                const threadKey = normalizeThreadKey(p.subject);
                const gkey = `${threadKey}|${c?.id ?? ''}`;
                const direction = dirOf(p);
                const snippet = p.textBody.slice(0, 200).replace(/\n/g, ' ').trim();
                const g = groups.get(gkey);
                if (!g) {
                    groups.set(gkey, {
                        user_id: account.user_id, contact_id: c?.id ?? null,
                        subject: p.subject.replace(/^(Re:|Fwd:|RE:|FWD:|Fw:)\s*/gi, '').trim(),
                        thread_key: threadKey, last_message_at: p.date, last_message_body: snippet,
                        last_message_direction: direction, inbound: direction === 'inbound' ? 1 : 0,
                    });
                } else {
                    g.last_message_at = p.date; g.last_message_body = snippet;
                    g.last_message_direction = direction;
                    if (direction === 'inbound') g.inbound++;
                }
            }

            // ONE bulk upsert for all threads in this batch (groups map guarantees
            // unique thread_key|contact_id keys), then bump counts concurrently.
            const threadIdByKey = new Map<string, string>();
            if (groups.size) {
                const { data: threadRows, error: thrErr } = await supabaseAdmin
                    .from('email_threads')
                    .upsert(
                        [...groups.values()].map((g) => ({
                            user_id: g.user_id, contact_id: g.contact_id, subject: g.subject,
                            thread_key: g.thread_key, last_message_at: g.last_message_at,
                            last_message_body: g.last_message_body, last_message_direction: g.last_message_direction,
                        })),
                        { onConflict: 'user_id,thread_key,contact_id' }
                    )
                    .select('id, thread_key, contact_id, unread_count, message_count');
                if (thrErr) console.error('[gmail/sync] thread upsert error:', thrErr.message);

                const bumps: Promise<unknown>[] = [];
                for (const thread of threadRows ?? []) {
                    const gkey = `${thread.thread_key}|${thread.contact_id ?? ''}`;
                    threadIdByKey.set(gkey, thread.id);
                    const g = groups.get(gkey);
                    if (g && g.inbound > 0) {
                        bumps.push(Promise.resolve(
                            supabaseAdmin.from('email_threads').update({
                                unread_count: (thread.unread_count ?? 0) + g.inbound,
                                message_count: (thread.message_count ?? 0) + g.inbound,
                            }).eq('id', thread.id)
                        ));
                    }
                }
                if (bumps.length) await Promise.all(bumps);
            }

            // 1 bulk insert of all new email_logs (ignore any racing duplicates by message_id)
            const rows = ordered.map((p) => {
                const c = contactFor(p);
                const threadKey = normalizeThreadKey(p.subject);
                const direction = dirOf(p);
                return {
                    user_id: account.user_id, contact_id: c?.id ?? null,
                    subject: p.subject, body: p.textBody, html_body: p.htmlBody,
                    from_address: p.from, to_address: p.to, in_reply_to: p.inReplyTo,
                    message_id: p.messageId, thread_id: threadKey,
                    email_thread_id: threadIdByKey.get(`${threadKey}|${c?.id ?? ''}`) ?? null,
                    direction, status: direction === 'outbound' ? 'sent' : 'received',
                    email_type: direction === 'inbound' ? 'inbound' : 'outbound', created_at: p.date,
                };
            });
            for (let i = 0; i < rows.length; i += 500) {
                const chunk = rows.slice(i, i + 500);
                const { error: insErr } = await supabaseAdmin
                    .from('email_logs').upsert(chunk, { onConflict: 'message_id', ignoreDuplicates: true });
                if (insErr) console.error('[gmail/sync] batch insert error:', insErr.message);
                else totalSynced += chunk.length;
            }

            await touchSynced();

        } catch (e: any) {
            failed++;
            const msg = `${account.email_address}: ${e?.message ?? String(e)}`;
            console.error('[gmail/sync] error for', msg);
            errors.push(msg);
        }
    }

    return json({
        synced: totalSynced,
        accounts: accounts.length,
        failed,
        skipped,
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
