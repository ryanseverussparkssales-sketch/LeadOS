import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

async function getOrCreateDefaultList(ownerId: string): Promise<string | null> {
	// Find existing default call list scoped to this owner
	const { data: existing } = await supabaseAdmin
		.from('call_lists')
		.select('id')
		.eq('name', 'Default')
		.eq('user_id', ownerId)
		.limit(1)
		.maybeSingle();

	if (existing) return existing.id;

	// Create client → project → call_list hierarchy
	const { data: client, error: clientErr } = await supabaseAdmin
		.from('clients')
		.insert({ user_id: ownerId, name: 'Default Client' })
		.select('id')
		.single();

	if (clientErr || !client) return null;

	const { data: project, error: projectErr } = await supabaseAdmin
		.from('projects')
		.insert({ client_id: client.id, name: 'Default Project', user_id: ownerId })
		.select('id')
		.single();

	if (projectErr || !project) return null;

	const { data: list } = await supabaseAdmin
		.from('call_lists')
		.insert({ project_id: project.id, name: 'Default', status: 'active', user_id: ownerId })
		.select('id')
		.single();

	return list?.id ?? null;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await requireAuth(request);
		const ownerId = await getEffectiveUserId(user.id);

		let body: Record<string, unknown>;
		try {
			body = await request.json();
		} catch {
			throw error(400, 'Invalid JSON body');
		}
		const { contact_id, phone_number, contact_name, call_type, script_id, campaign_id, call_list_id } = body as {
			contact_id?: string;
			phone_number?: string;
			contact_name?: string;
			call_type?: string;
			script_id?: string;
			campaign_id?: string;
			call_list_id?: string;
		};
		if (!contact_id && !phone_number) throw error(400, 'contact_id or phone_number required');

		// Resolve (or create) the contact this call is for. The desk phone dials raw
		// numbers, so match an existing contact by phone or auto-create a lightweight one.
		type ContactRow = { id: string; phone: string | null; call_count: number | null; status: string | null; name: string | null };
		let contact: ContactRow | null = null;

		if (contact_id) {
			const { data, error: contactErr } = await supabaseAdmin
				.from('contacts').select('id, phone, call_count, status, name')
				.eq('id', contact_id).eq('user_id', ownerId).maybeSingle();
			if (contactErr) throw error(500, contactErr.message);
			contact = data;
		} else if (phone_number) {
			const norm = normalizePhone(phone_number);
			const { data: existing } = await supabaseAdmin
				.from('contacts').select('id, phone, call_count, status, name')
				.eq('user_id', ownerId).eq('phone_normalized', norm).maybeSingle();
			if (existing) {
				contact = existing;
			} else {
				const { data: created } = await supabaseAdmin
					.from('contacts').insert({
						user_id: ownerId,
						name: contact_name ?? phone_number,
						phone: phone_number,
						phone_normalized: norm,
						status: 'active',
						contact_type: 'lead',
						lead_source: 'desk_phone',
					}).select('id, phone, call_count, status, name').single();
				contact = created ?? null;
			}
		}

		if (!contact) throw error(404, 'Contact not found');
		if (contact.status === 'do_not_call') {
			throw error(403, `Contact "${contact.name}" is marked Do Not Call`);
		}
		if (!contact.phone) throw error(400, 'Contact has no phone number');

		const callListId = call_list_id ?? await getOrCreateDefaultList(ownerId);
		if (!callListId) throw error(500, 'Could not resolve call list');

		const { data: call, error: callErr } = await supabaseAdmin
			.from('calls')
			.insert({
				user_id: ownerId,
				contact_id: contact.id,
				call_list_id: callListId,
				phone_number: contact.phone,
				call_type: call_type ?? 'cold_call',
				script_id: script_id ?? null,
				campaign_id: campaign_id ?? null,
				started_at: new Date().toISOString(),
		})
		.select()
		.single();

		if (callErr || !call) throw error(500, callErr?.message ?? 'Failed to create call record');

		// Increment call_count and set last_called_at (fire-and-forget)
		supabaseAdmin
			.from('contacts')
			.update({ call_count: (contact.call_count ?? 0) + 1, last_called_at: new Date().toISOString() })
			.eq('id', contact.id)
			.then(({ error: e }) => { if (e) console.error('[calls/start] count update:', e); });

		return json({ call_id: call.id, phone_number: contact.phone }, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('[calls/start] unhandled error:', err);
		throw error(500, 'Internal server error');
	}
};
