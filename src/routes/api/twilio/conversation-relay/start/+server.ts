import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { getTwilioCreds } from '$lib/server/twilio';
import { assertAiAccess } from '$lib/server/tier';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

/**
 * Place an outbound AI-qualification call. Creates a `calls` row, then dials the
 * contact via the Twilio REST API with the call's Voice URL pointed at our
 * ConversationRelay TwiML endpoint. The WS server (relay-server/) runs the live
 * conversation and writes the transcript/outcome back to this same call row.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	const ownerId = await getEffectiveUserId(user.id);

	const { contact_id, phone_number, from } = await request.json() as {
		contact_id?: string; phone_number?: string; from?: string;
	};
	if (!contact_id && !phone_number) throw error(400, 'contact_id or phone_number required');
	const creds = await getTwilioCreds(user.id);
	if (!creds.hasRest) throw error(503, 'Twilio not configured');
	if (!env.RELAY_WS_URL) throw error(503, 'ConversationRelay WS server not configured (RELAY_WS_URL)');

	type ContactRow = { id: string; phone: string | null; name: string | null; status: string | null };
	let contact: ContactRow | null = null;
	if (contact_id) {
		const { data } = await supabaseAdmin
			.from('contacts').select('id, phone, name, status')
			.eq('id', contact_id).eq('user_id', ownerId).maybeSingle();
		contact = data;
	} else if (phone_number) {
		const norm = normalizePhone(phone_number);
		const { data: existing } = await supabaseAdmin
			.from('contacts').select('id, phone, name, status')
			.eq('user_id', ownerId).eq('phone_normalized', norm).maybeSingle();
		if (existing) {
			contact = existing;
		} else {
			const { data: created } = await supabaseAdmin
				.from('contacts').insert({
					user_id: ownerId, name: phone_number, phone: phone_number, phone_normalized: norm,
					status: 'active', contact_type: 'lead', lead_source: 'ai_dialer',
				}).select('id, phone, name, status').single();
			contact = created ?? null;
		}
	}
	if (!contact) throw error(404, 'Contact not found');
	if (contact.status === 'do_not_call') throw error(403, 'Contact is marked Do Not Call');
	if (!contact.phone) throw error(400, 'Contact has no phone number');

	const { data: list } = await supabaseAdmin
		.from('call_lists').select('id').eq('name', 'Default').eq('user_id', ownerId).limit(1).maybeSingle();

	const { data: call, error: callErr } = await supabaseAdmin
		.from('calls').insert({
			user_id: ownerId, contact_id: contact.id, call_list_id: list?.id ?? null,
			phone_number: contact.phone, call_type: 'ai_qualification', direction: 'outbound',
			started_at: new Date().toISOString(),
		}).select('id').single();
	if (callErr || !call) throw error(500, callErr?.message ?? 'Could not create call record');

	const fromNumber = from || creds.phoneNumber;
	if (!fromNumber) throw error(400, 'No "from" number available');

	const twimlUrl = `${url.origin}/api/twilio/conversation-relay?callId=${call.id}` +
		(contact.name ? `&contactName=${encodeURIComponent(contact.name)}` : '');

	const client = twilio(creds.accountSid, creds.authToken);
	try {
		const created = await client.calls.create({ to: contact.phone, from: fromNumber, url: twimlUrl, method: 'POST' });
		await supabaseAdmin.from('calls').update({ twilio_call_sid: created.sid }).eq('id', call.id);
		return json({ call_id: call.id, call_sid: created.sid, status: created.status }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Twilio call failed';
		await supabaseAdmin.from('calls').update({ outcome: 'failed', summary: msg }).eq('id', call.id);
		throw error(502, msg);
	}
};
