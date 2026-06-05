import { json, error } from '@sveltejs/kit';
import { rateLimitUser } from '$lib/server/rateLimit';
import { env } from '$env/dynamic/private';
import { requireAuth, getEffectiveUserId } from '$lib/server/supabase';
import { sendEmail, logEmail } from '$lib/server/email';
import { buildReplyToAddress } from '$lib/server/replyTag';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);

    const {
        to, subject, html, text, contactId, clientId, projectId, campaignId, accountId,
        emailType = 'outbound', replyTo: explicitReplyTo, from,
    } = await request.json();

    if (!to || !subject || !html) throw error(400, 'to, subject, html required');

    // ── Build reply-to address with campaign context ──────────────────────────
    const inboundDomain = env.RESEND_INBOUND_DOMAIN ?? env.PUBLIC_REPLY_DOMAIN ?? null;
    let replyTo: string | undefined = explicitReplyTo ?? undefined;

    if (inboundDomain && (campaignId || clientId || projectId) && !explicitReplyTo) {
        replyTo = buildReplyToAddress({
            uid: ownerId,
            cid: campaignId ?? undefined,
            pid: projectId ?? undefined,
            lid: contactId ?? undefined,
        }, inboundDomain);
    }

    const result = await sendEmail({
        userId: ownerId,
        clientId: clientId ?? undefined,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text ?? undefined,
        from: from ?? undefined,
        replyTo,
    });

    if (!result.success) throw error(500, result.error ?? 'Email send failed');
    return json({ success: true, messageId: result.messageId });
};
