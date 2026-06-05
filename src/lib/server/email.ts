import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import { decryptValue } from './crypto';
import { supabaseAdmin } from './supabase';

export interface EmailAttachment {
    filename: string;
    content: string;   // base64-encoded
    encoding: 'base64';
    contentType: string;
}

export interface SendEmailOptions {
    to: string | string[];
    cc?: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    /** Tenant whose sending account to use. Omit for system/transactional email (sends via the default Resend sender). */
    userId?: string;
    clientId?: string;
    accountId?: string;
    attachments?: EmailAttachment[];
}

export interface EmailResult {
    success: boolean;
    messageId?: string;
    sender?: string;
    method?: 'smtp' | 'resend';
    error?: string;
}

// Find the best email account to use
async function resolveEmailAccount(userId?: string, clientId?: string, accountId?: string) {
    if (!userId) return null; // system/transactional email → Resend default sender
    if (accountId) {
        const { data } = await supabaseAdmin
            .from('email_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('id', accountId)
            .maybeSingle();
        return data ?? null;
    }

    if (clientId) {
        // Try client-specific account first
        const { data: clientAcc } = await supabaseAdmin
            .from('email_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('client_id', clientId)
            .maybeSingle();
        if (clientAcc) return clientAcc;
        // Fall through to default
    }

    const { data } = await supabaseAdmin
        .from('email_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();
    return data ?? null;
}

// Send via Gmail SMTP using nodemailer
async function sendViaSMTP(account: Record<string, unknown>, options: SendEmailOptions): Promise<EmailResult> {
    let password = account.smtp_password_encrypted as string;
    try {
        password = decryptValue(account.smtp_password_encrypted as string);
    } catch { /* use as-is if not encrypted */ }

    const transporter = nodemailer.createTransport({
        host: account.smtp_host as string,
        port: account.smtp_port as number,
        secure: (account.smtp_port as number) === 465,
        auth: {
            user: account.smtp_user as string,
            pass: password,
        },
        tls: { rejectUnauthorized: false },
    });

    const toArray = Array.isArray(options.to) ? options.to : [options.to];

    const info = await transporter.sendMail({
        from: options.from ?? `${account.label} <${account.email_address}>`,
        to: toArray.join(', '),
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo ?? (account.email_address as string),
    });

    return {
        success: true,
        messageId: info.messageId,
        sender: account.email_address as string,
        method: 'smtp',
    };
}

// Send via Resend HTTP API (no npm package needed)
async function sendViaResend(options: SendEmailOptions): Promise<EmailResult> {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

    const fromAddress = options.from ?? env.RESEND_FROM ?? 'RogueOS <noreply@leados.app>';
    const toArray = Array.isArray(options.to) ? options.to : [options.to];

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: fromAddress,
            to: toArray,
            cc: options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined,
            subject: options.subject,
            html: options.html,
            text: options.text,
            reply_to: options.replyTo,
            attachments: options.attachments?.map(a => ({
                filename: a.filename,
                content: a.content,
            })),
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        return { success: false, error: err.message ?? `Resend error ${res.status}` };
    }

    const data = await res.json() as { id: string };
    return {
        success: true,
        messageId: data.id,
        sender: fromAddress,
        method: 'resend',
    };
}

// Main send function — tries SMTP first, falls back to Resend
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    // Try to find a configured SMTP account
    const account = await resolveEmailAccount(options.userId, options.clientId, options.accountId);

    if (account) {
        try {
            return await sendViaSMTP(account, options);
        } catch (err) {
            console.error('[email] SMTP failed, falling back to Resend:', err);
            // Fall through to Resend
        }
    }

    // Fall back to Resend
    return await sendViaResend(options);
}

// Log a sent email to email_logs table
export async function logEmail(userId: string, contactId: string | null, opts: {
    subject: string;
    emailType: string;
    toAddress: string;
    fromAddress: string;
    status: string;
    htmlContent?: string;
    // Campaign routing context (populated when sending on behalf of a campaign)
    campaignId?: string | null;
    projectId?: string | null;
    clientId?: string | null;
    replyToAddress?: string | null;
}) {
    supabaseAdmin.from('email_logs').insert({
        user_id: userId,
        contact_id: contactId,
        subject: opts.subject,
        email_type: opts.emailType,
        to_address: opts.toAddress,
        from_address: opts.fromAddress,
        status: opts.status,
        generated_by: 'system',
        sent_at: opts.status === 'sent' ? new Date().toISOString() : null,
        // Campaign / project / client routing
        campaign_id: opts.campaignId ?? null,
        project_id: opts.projectId ?? null,
        client_id: opts.clientId ?? null,
        reply_tag: opts.replyToAddress ?? null,
        direction: 'outbound',
    }).then(({ error }) => { if (error) console.error('[email] logEmail error:', error.message); });
}
