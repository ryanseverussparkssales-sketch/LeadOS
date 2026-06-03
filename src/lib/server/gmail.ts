/**
 * Gmail API helper — token refresh, incremental message fetch, message parsing.
 * Used by /api/gmail/sync and any route that needs to read/send via Gmail OAuth.
 */
import { supabaseAdmin } from './supabase';
import { env } from '$env/dynamic/private';

export interface GmailAccount {
    id: string;
    user_id: string;
    email_address: string;
    oauth_access_token: string;
    oauth_refresh_token: string;
    oauth_token_expires_at: string;
    gmail_history_id: string | null;
    last_synced_at: string | null;
}

export interface ParsedGmailMessage {
    messageId: string;
    gmailId: string;
    from: string;
    to: string;
    subject: string;
    textBody: string;
    htmlBody: string;
    inReplyTo: string | null;
    date: string;
    isInbox: boolean;
    isSent: boolean;
    isUnread: boolean;
}

// ── Token management ─────────────────────────────────────────────────────────

/**
 * Return a valid access token, refreshing via refresh_token if expiring within 5 min.
 */
export async function getValidToken(account: GmailAccount): Promise<string> {
    const expiresAt = new Date(account.oauth_token_expires_at).getTime();
    const fiveMinMs = 5 * 60 * 1000;

    if (Date.now() < expiresAt - fiveMinMs) {
        return account.oauth_access_token;
    }

    if (!account.oauth_refresh_token) {
        throw new Error(`[gmail] no refresh_token for account ${account.email_address} — user must re-authorize`);
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            refresh_token: account.oauth_refresh_token,
            grant_type: 'refresh_token',
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`[gmail] token refresh failed for ${account.email_address}: ${body}`);
    }

    const tokens = await res.json();
    const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await supabaseAdmin
        .from('email_accounts')
        .update({
            oauth_access_token: tokens.access_token,
            oauth_token_expires_at: newExpiry,
        })
        .eq('id', account.id);

    return tokens.access_token as string;
}

// ── Message fetching ─────────────────────────────────────────────────────────

/**
 * Fetch new INBOX messages since last sync.
 * Uses Gmail History API for incremental sync; falls back to list on first run or
 * when history ID has expired (404).
 */
export async function fetchNewMessages(
    account: GmailAccount,
    accessToken: string
): Promise<any[]> {
    if (account.gmail_history_id) {
        return fetchViaHistory(account, accessToken);
    }
    return fetchRecentMessages(account, accessToken, 25);
}

async function fetchViaHistory(account: GmailAccount, accessToken: string): Promise<any[]> {
    const historyRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history` +
        `?startHistoryId=${account.gmail_history_id}&historyTypes=messageAdded&labelId=INBOX`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (historyRes.status === 404) {
        // History ID too old — full refresh
        console.warn(`[gmail] history ID expired for ${account.email_address}, falling back to list`);
        return fetchRecentMessages(account, accessToken, 50);
    }

    if (!historyRes.ok) {
        console.error(`[gmail] history fetch failed for ${account.email_address}:`, historyRes.status);
        return [];
    }

    const history = await historyRes.json();

    // Advance the stored history ID
    if (history.historyId) {
        await supabaseAdmin
            .from('email_accounts')
            .update({ gmail_history_id: history.historyId })
            .eq('id', account.id);
    }

    // Collect unique message IDs added to INBOX
    const seenIds = new Set<string>();
    const messageIds: string[] = [];
    for (const record of history.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
            const msg = added.message;
            if (msg?.id && !seenIds.has(msg.id) && msg.labelIds?.includes('INBOX')) {
                seenIds.add(msg.id);
                messageIds.push(msg.id);
            }
        }
    }

    const messages: any[] = [];
    for (const msgId of messageIds) {
        const msg = await fetchFullMessage(msgId, accessToken);
        if (msg) messages.push(msg);
    }
    return messages;
}

async function fetchRecentMessages(
    account: GmailAccount,
    accessToken: string,
    maxResults: number
): Promise<any[]> {
    const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=${maxResults}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
        console.error(`[gmail] message list failed for ${account.email_address}:`, listRes.status);
        return [];
    }

    const list = await listRes.json();

    // Capture the current history ID so future syncs are incremental
    const profileRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.historyId) {
            await supabaseAdmin
                .from('email_accounts')
                .update({ gmail_history_id: profile.historyId })
                .eq('id', account.id);
        }
    }

    const items: any[] = (list.messages ?? []).slice(0, maxResults);
    const messages: any[] = [];
    for (const item of items) {
        const msg = await fetchFullMessage(item.id, accessToken);
        if (msg) messages.push(msg);
    }
    return messages;
}

async function fetchFullMessage(messageId: string, accessToken: string): Promise<any | null> {
    const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    return res.json();
}

// ── Message parsing ──────────────────────────────────────────────────────────

/**
 * Parse a raw Gmail API message into a normalized shape compatible with email_logs.
 */
export function parseGmailMessage(msg: any): ParsedGmailMessage | null {
    try {
        const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
        const get = (name: string) =>
            headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

        const from = get('From');
        const to = get('To');
        const subject = get('Subject') || '(no subject)';
        const inReplyTo = get('In-Reply-To') || null;
        const rawMessageId = get('Message-ID') || `gmail-${msg.id}`;
        const rawDate = get('Date');

        const labels: string[] = msg.labelIds ?? [];
        const isInbox = labels.includes('INBOX');
        const isSent = labels.includes('SENT');
        const isUnread = labels.includes('UNREAD');

        let textBody = '';
        let htmlBody = '';

        function extractBody(part: any) {
            if (!part) return;
            if (part.mimeType === 'text/plain' && part.body?.data) {
                textBody = Buffer.from(part.body.data, 'base64url').toString('utf-8');
            } else if (part.mimeType === 'text/html' && part.body?.data) {
                htmlBody = Buffer.from(part.body.data, 'base64url').toString('utf-8');
            } else if (part.parts) {
                for (const p of part.parts) extractBody(p);
            }
        }
        extractBody(msg.payload);

        // Fallback: strip HTML to make a plain text body
        if (!textBody && htmlBody) {
            textBody = htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }

        let parsedDate: string;
        try {
            parsedDate = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
        } catch {
            parsedDate = new Date().toISOString();
        }

        return {
            messageId: rawMessageId,
            gmailId: msg.id,
            from,
            to,
            subject,
            textBody,
            htmlBody,
            inReplyTo,
            date: parsedDate,
            isInbox,
            isSent,
            isUnread,
        };
    } catch (e) {
        console.error('[gmail] parseGmailMessage error:', e);
        return null;
    }
}

/**
 * Mark a Gmail message as read by removing the UNREAD label.
 */
export async function markGmailRead(gmailId: string, accessToken: string): Promise<void> {
    await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}/modify`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        }
    );
}
