import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const callListId = url.searchParams.get('call_list_id');

	let contact;

	if (callListId) {
		// Pull next pending contact from the specific call list — highest score first
		const { data } = await supabaseAdmin
			.from('call_list_contacts')
			.select('contact:contacts(*, tags:contact_tag_mappings(tag:contact_tags(*)))')
			.eq('call_list_id', callListId)
			.eq('status', 'pending')
			.neq('contact.status', 'do_not_call')
			.order('queue_position', { ascending: true, nullsFirst: false })
			.limit(1)
			.maybeSingle();

		contact = data?.contact;
	} else {
		// Fallback: any active contact — highest score first, then oldest first among equals
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('*, tags:contact_tag_mappings(tag:contact_tags(*))')
			.eq('user_id', ownerId)
			.eq('status', 'active')
			.neq('status', 'do_not_call')
			.order('contact_score', { ascending: false, nullsFirst: false })
			.order('created_at', { ascending: true })
			.limit(1)
			.maybeSingle();

		contact = data;
	}

	if (!contact) return new Response(null, { status: 204 });

	// Flatten nested tags: [{tag: {id, name, color}}] → [{id, name, color}]
	const flat = {
		...(contact as Record<string, unknown>),
		tags: ((contact as Record<string, unknown>).tags as Array<{ tag: Record<string, unknown> }> | null)
			?.map((t) => t.tag).filter(Boolean) ?? [],
	};

	return json(flat);
};
