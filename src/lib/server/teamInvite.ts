import { sendEmail } from './email';
import { env } from '$env/dynamic/private';
import { BRAND } from '$lib/brand';

// System/transactional team-invite email (Resend default sender; failures are non-fatal)
export async function sendInviteEmail(inviterEmail: string, toEmail: string): Promise<boolean> {
	const siteUrl = env.PUBLIC_SITE_URL ?? 'https://lead-os-livid.vercel.app';
	const result = await sendEmail({
		to: toEmail,
		subject: `${inviterEmail} invited you to their team on ${BRAND}`,
		html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
			<h2 style="font-weight:600;margin:0 0 16px">You've been invited</h2>
			<p style="line-height:1.6;margin:0 0 20px"><strong>${inviterEmail}</strong> added you to their team on ${BRAND}.
			Create your account with this email address (${toEmail}) to get started.</p>
			<a href="${siteUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">Accept invite &rarr;</a>
			<p style="color:#888;font-size:12px;margin-top:24px">If you weren't expecting this, you can ignore this email.</p>
		</div>`,
	}).catch((err) => { console.error('[team/invite] email send failed:', err); return { success: false as const }; });
	if (!result.success) console.error('[team/invite] invite email not delivered to', toEmail);
	return result.success;
}
