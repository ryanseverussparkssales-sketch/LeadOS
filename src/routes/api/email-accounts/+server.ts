import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { encryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    const user = await requireAuth(request);
    const { data } = await supabaseAdmin
        .from('email_accounts')
        .select('id, label, email_address, smtp_host, smtp_port, is_default, client_id, client:clients(name), created_at')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('label');
    return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
    const user = await requireAuth(request);
    const { label, emailAddress, smtpHost, smtpPort, smtpUser, appPassword, isDefault, clientId } = await request.json();

    if (!emailAddress || !appPassword) throw error(400, 'emailAddress and appPassword required');

    // Encrypt the App Password
    let encrypted = appPassword;
    try { encrypted = encryptValue(appPassword); } catch (e) { console.error('Encryption failed:', e); }

    // If setting as default, unset others first
    if (isDefault) {
        await supabaseAdmin.from('email_accounts').update({ is_default: false }).eq('user_id', user.id);
    }

    const { data, error: e } = await supabaseAdmin
        .from('email_accounts')
        .insert({
            user_id: user.id,
            label: label || emailAddress,
            email_address: emailAddress,
            smtp_host: smtpHost || 'smtp.gmail.com',
            smtp_port: smtpPort || 587,
            smtp_user: smtpUser || emailAddress,
            smtp_password_encrypted: encrypted,
            is_default: isDefault ?? false,
            client_id: clientId || null,
        })
        .select('id, label, email_address, smtp_host, smtp_port, is_default, client_id')
        .single();

    if (e) throw error(400, e.message);
    return json(data, { status: 201 });
};
