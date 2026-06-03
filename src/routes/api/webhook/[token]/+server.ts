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
		if (utmContent)                             updates.utm_content  = utmContent;
		if (utmTerm)                                updates.utm_term     = utmTerm;
		if (source.id   && !existing.lead_source_id) updates.lead_source_id = source.id;
		// Merge metadata — new keys win over old, but old keys not in new payload are preserved
		if (Object.keys(leadMetadata).length > 0) {
			updates.lead_metadata = { ...(existing.lead_metadata ?? {}), ...leadMetadata };
		}
		const { data } = await supabaseAdmin
			.from('contacts')
			.update(updates)
			.eq('id', existing.id)
			.select()
			.single();
		contact = data;
	} else {
		// Create new contact
		const { data, error } = await supabaseAdmin.from('contacts').insert({
			user_id: source.user_id,
			name: name || 'Unknown',
			phone: phone || '',
			phone_normalized: phoneNorm,
			email: email || null,
			email_normalized: email ? email.toLowerCase() : null,
			company: company || null,
			title: title || null,
			status: 'active',
			contact_type: source.default_contact_type ?? 'lead',
			lead_source: source.source_type ?? 'webhook',
			utm_source: utmSource,
			utm_medium: utmMedium,
			utm_campaign: utmCampaign,
			utm_content: utmContent,
			utm_term: utmTerm,
			lead_metadata: Object.keys(leadMetadata).length > 0 ? leadMetadata : null,
			lead_source_id: source.id,
		}).select().single();
		if (error) return json({ error: error.message }, { status: 400 });
		contact = data;

		// Increment lead count on source (new contacts only)
		await supabaseAdmin
			.from('lead_sources')
			.update({
				lead_count: (source.lead_count ?? 0) + 1,
				leads_today: (source.leads_today ?? 0) + 1,
				leads_this_week: (source.leads_this_week ?? 0) + 1,
				last_lead_at: new Date().toISOString(),
			})
			.eq('id', source.id);

		// Fire-and-forget initial score — doesn't block the webhook response
		if (contact) {
			const score = initialContactScore({
				contact_type: contact.contact_type,
				phone:        contact.phone,
				email:        contact.email,
				company:      contact.company,
				lead_source:  contact.lead_source,
			});
			supabaseAdmin
				.from('contacts')
				.update({ contact_score: score, score_updated_at: new Date().toISOString() })
				.eq('id', contact.id)
				.catch((e: unknown) => console.error('[webhook] initial scoring error:', e));
		}
	}

	// Apply routing rules (new contacts only — skip re-routing existing contacts)
	if (!existing && contact) {
		const routingResult = await applyRoutingRules(
			{
				id: contact.id,
				name: contact.name,
				phone: contact.phone,
				email: contact.email,
				company: contact.company,
				lead_source: source.source_type,
				utm_source: utmSource,
				utm_medium: utmMedium,
				utm_campaign: utmCampaign,
				contact_type: source.default_contact_type,
			},
			source.user_id,
			source.id ?? null,
			source.campaign_id ?? null,
			source.auto_call_list_id ?? null
		);

		if (routingResult.skip) {
			// Contact was soft-deleted by a skip rule — don't add to call list
			return json({ received: true, routed: 'skip' });
		}

		// Use routing result for call-list assignment (may override source default)
		const effectiveCallListId = routingResult.callListId ?? source.auto_call_list_id;
		if (effectiveCallListId) {
			await supabaseAdmin.from('call_list_contacts').upsert({
				call_list_id: effectiveCallListId,
				contact_id: contact.id,
				status: 'pending',
			}, { onConflict: 'call_list_id,contact_id' });
		}
	} else if (existing && contact && source.auto_call_list_id) {
		// Existing contact — honour source default only (no re-routing)
		await supabaseAdmin.from('call_list_contacts').upsert({
			call_list_id: source.auto_call_list_id,
			contact_id: contact.id,
			status: 'pending',
		}, { onConflict: 'call_list_id,contact_id' });
	}

	// Fire lead_arrived webhook for new contacts only (fire-and-forget)
	if (!existing && contact) {
		deliverWebhooks(source.user_id, 'lead_arrived', {
			contactId: contact.id, name: contact.name, source: source.source_type,
		}).catch(console.error);
	}

	return json({ success: true, contact_id: contact?.id, existing: !!existing });
};

// Support Zapier's test/check request
export const GET: RequestHandler = async ({ params }) => {
	const { data: source } = await supabaseAdmin
		.from('lead_sources').select('name, source_type').eq('webhook_token', params.token).single();
	if (!source) return json({ error: 'Invalid token' }, { status: 401 });
	return json({
		status: 'active',
		source: source.name,
		accepts: ['name', 'phone', 'email', 'company', 'title',
			'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
	});
};
