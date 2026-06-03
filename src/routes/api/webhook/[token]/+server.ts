import { json } from '@sveltejs/kit';
import { supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import { deliverWebhooks } from '$lib/server/webhooks';
import { initialContactScore } from '$lib/server/scoring';
import { applyRoutingRules } from '$lib/server/routingRules';
import type { RequestHandler } from './$types';

// Public endpoint — authenticated by webhook token only
export const POST: RequestHandler = async ({ request, params }) => {
	const { token } = params;

	// Look up lead source
	const { data: source } = await supabaseAdmin
		.from('lead_sources')
		.select('*')
		.eq('webhook_token', token)
		.eq('status', 'active')
		.single();

	if (!source) return json({ error: 'Invalid webhook token' }, { status: 401 });

	// Parse body — supports JSON, form data, or Zapier format
	let body: Record<string, unknown> = {};
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		body = await request.json().catch(() => ({}));
	} else if (contentType.includes('form')) {
		const fd = await request.formData().catch(() => new FormData());
		for (const [k, v] of fd.entries()) body[k] = v as string;
	}

	// Extract contact fields (supports common Zapier field names)
	const name    = body.name ?? body.full_name ?? body.first_name ? `${body.first_name ?? ''} ${body.last_name ?? ''}`.trim() : 'Unknown';
	const phone   = (body.phone ?? body.phone_number ?? body.mobile ?? '') as string;
	const email   = (body.email ?? body.email_address ?? '') as string;
	const company = (body.company ?? body.company_name ?? body.organization ?? '') as string;
	const title   = (body.title ?? body.job_title ?? '') as string;

	if (!name && !phone && !email) {
		return json({ error: 'No contact data provided' }, { status: 400 });
	}

	// Extract UTM parameters from the payload
	const utmSource   = (body.utm_source   ?? body.UTM_SOURCE   ?? null) as string | null;
	const utmMedium   = (body.utm_medium   ?? body.UTM_MEDIUM   ?? null) as string | null;
	const utmCampaign = (body.utm_campaign ?? body.UTM_CAMPAIGN ?? null) as string | null;
	const utmContent  = (body.utm_content  ?? body.UTM_CONTENT  ?? null) as string | null;
	const utmTerm     = (body.utm_term     ?? body.UTM_TERM     ?? null) as string | null;

	// Capture ALL unknown fields as metadata (everything not mapped to a known field)
	const KNOWN_FIELDS = new Set([
		'name', 'full_name', 'first_name', 'last_name', 'phone', 'phone_number', 'mobile',
		'email', 'email_address', 'company', 'company_name', 'organization', 'title', 'job_title',
		'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
		'UTM_SOURCE', 'UTM_MEDIUM', 'UTM_CAMPAIGN', 'UTM_CONTENT', 'UTM_TERM',
		'contact_type', 'notes', 'source', 'token'
	]);
	const leadMetadata: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body)) {
		if (!KNOWN_FIELDS.has(key) && value !== null && value !== undefined && value !== '') {
			leadMetadata[key] = value;
		}
	}

	const phoneNorm = phone ? normalizePhone(phone) : null;

	// Dedup by phone or email
	let existing = null;
	if (phoneNorm) {
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('id, utm_source, utm_medium, utm_campaign, lead_source_id, lead_metadata')
			.eq('user_id', source.user_id)
			.eq('phone_normalized', phoneNorm)
			.maybeSingle();
		existing = data;
	}
	if (!existing && email) {
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('id, utm_source, utm_medium, utm_campaign, lead_source_id, lead_metadata')
			.eq('user_id', source.user_id)
			.eq('email_normalized', email.toLowerCase())
			.maybeSingle();
		existing = data;
	}

	let contact;
	if (existing) {
		// On duplicate found — merge UTMs if new ones provided (never overwrite existing)
		const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (utmSource   && !existing.utm_source)    updates.utm_source   = utmSource;
		if (utmMedium   && !existing.utm_medium)    updates.utm_medium   = utmMedium;
		if (utmCampaign && !existing.utm_campaign)  updates.utm_campaign = utmCampaign;
		if (utmContent  && !existing.utm_content)   updates.utm_content  = utmContent;
		if (utmTerm     && !existing.utm_term)       updates.utm_term     = utmTerm;
		if (Object.keys(leadMetadata).length > 0) {
			updates.lead_metadata = { ...(existing.lead_metadata as Record<string, unknown> ?? {}), ...leadMetadata };
		}
		const { data: updated } = await supabaseAdmin.from('contacts').update(updates).eq('id', existing.id).select().single();
		contact = updated;
	} else {
		// New contact — create + apply routing rules
		const score = initialContactScore({ phone, email, company });
		const { data: created } = await supabaseAdmin.from('contacts').insert({
			user_id: source.user_id,
			name: name || 'Unknown',
			phone: phone || null,
			phone_normalized: phoneNorm,
			email: email || null,
			email_normalized: email ? email.toLowerCase() : null,
			company: company || null,
			title: title || null,
			lead_source_id: source.id,
			contact_type: (body.contact_type as string) ?? source.default_contact_type ?? 'lead',
			utm_source: utmSource,
			utm_medium: utmMedium,
			utm_campaign: utmCampaign,
			utm_content: utmContent,
			utm_term: utmTerm,
			lead_metadata: Object.keys(leadMetadata).length > 0 ? leadMetadata : null,
			notes: (body.notes as string) ?? null,
			lead_score: score,
			status: 'new',
		}).select().single();
		contact = created;
		if (contact) await applyRoutingRules(contact, source.user_id).catch(console.error);
	}

	if (!contact) return json({ error: 'Failed to process contact' }, { status: 500 });
	await deliverWebhooks(source.user_id, 'contact.created', contact).catch(console.error);
	return json({ ok: true, contact_id: contact.id, action: existing ? 'updated' : 'created' });
};