import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { sendEmail } from '$lib/server/email';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Public endpoint — no auth required
export const POST: RequestHandler = async ({ request }) => {
	const { name, email, company, vertical, budget, message } = await request.json();

	if (!name?.trim() || !email?.trim()) {
		return json({ error: 'name and email required' }, { status: 400 });
	}

	// Save to DB
	const { error: dbErr } = await supabaseAdmin
		.from('contact_inquiries')
		.insert({
			name: name.trim(),
			email: email.trim().toLowerCase(),
			company: company?.trim() || null,
			vertical: vertical || null,
			budget: budget || null,
			message: message?.trim() || null,
			source: 'contact_page',
		});

	if (dbErr) {
		console.error('[contact-inquiry] DB error:', dbErr.message);
		// Don't fail the user — still try to send email
	}

	// Email notification to Ryan
	try {
		await sendEmail({
			to: 'ryanseverussparkssales@gmail.com',
			subject: `New Hire Inquiry — ${name} @ ${company || 'Unknown'}`,
			html: `
				<p><strong>New inquiry from ${name}</strong></p>
				<p><strong>Email:</strong> ${email}</p>
				<p><strong>Company:</strong> ${company || '—'}</p>
				<p><strong>Vertical:</strong> ${vertical || '—'}</p>
				<p><strong>Budget:</strong> ${budget || '—'}</p>
				<p><strong>Message:</strong><br>${message || '—'}</p>
			`,
			text: `New inquiry from ${name} (${email}) at ${company || 'N/A'}. Budget: ${budget || 'N/A'}. Message: ${message || 'N/A'}`,
		});
	} catch (emailErr) {
		console.error('[contact-inquiry] email error:', emailErr);
	}

	return json({ ok: true });
};
