import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: list docs for a client (works for both admin and portal users)
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const clientId = url.searchParams.get('client_id');

	// Portal users: get client_id from their membership
	let resolvedClientId = clientId;
	if (!clientId) {
		const { data: membership } = await supabaseAdmin
			.from('team_members')
			.select('client_id, owner_user_id')
			.eq('member_user_id', user.id)
			.eq('portal_access', true)
			.maybeSingle();
		if (membership?.client_id) resolvedClientId = membership.client_id;
	}

	if (!resolvedClientId) throw error(400, 'client_id required');

	const { data } = await supabaseAdmin
		.from('client_docs')
		.select('id, title, doc_type, url, file_size, description, is_visible_to_client, from_client, submitted_by_name, created_at')
		.eq('owner_user_id', ownerId)
		.eq('client_id', resolvedClientId)
		.order('created_at', { ascending: false });

	// Portal users only see docs marked visible
	const { data: memberCheck } = await supabaseAdmin
		.from('team_members')
		.select('portal_access')
		.eq('member_user_id', user.id)
		.maybeSingle();

	const isPortalUser = memberCheck?.portal_access === true;
	const docs = isPortalUser
		? (data ?? []).filter(d => d.is_visible_to_client)
		: (data ?? []);

	return json(docs);
};

// POST: admin OR client portal user submits a doc
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	// Check if caller is a portal user
	const { data: membership } = await supabaseAdmin
		.from('team_members')
		.select('client_id, owner_user_id, portal_access, member_email')
		.eq('member_user_id', user.id)
		.maybeSingle();

	const isPortalUser = membership?.portal_access === true;

	// Resolve ownerId and clientId
	const ownerId = isPortalUser ? membership!.owner_user_id : await getEffectiveUserId(user.id);
	const body = await request.json();
	const clientId = isPortalUser ? membership!.client_id : body.clientId;

	if (!clientId || !body.title || !body.url) throw error(400, 'clientId, title, url required');

	const { data, error: e } = await supabaseAdmin
		.from('client_docs')
		.insert({
			owner_user_id: ownerId,
			client_id: clientId,
			title: body.title.trim(),
			url: body.url.trim(),
			doc_type: body.docType ?? 'file',
			description: body.description ?? null,
			is_visible_to_client: isPortalUser ? true : (body.isVisibleToClient ?? true),
			file_size: body.fileSize ?? null,
			from_client: isPortalUser ? true : (body.fromClient ?? false),
			submitted_by_name: isPortalUser ? (membership!.member_email ?? null) : null,
		})
		.select().single();

	if (e) throw error(400, e.message);
	return json(data, { status: 201 });
};

// DELETE
export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	await supabaseAdmin.from('client_docs').delete()
		.eq('id', id).eq('owner_user_id', ownerId);
	return json({ ok: true });
};
