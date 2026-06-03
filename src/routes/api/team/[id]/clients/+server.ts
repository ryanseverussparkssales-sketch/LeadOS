import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';

// GET — list client assignments for a team member
export const GET = async ({ request, params }: { request: Request; params: { id: string } }) => {
	const user = await requireAuth(request);

	const { data } = await supabaseAdmin
		.from('team_member_clients')
		.select('id, client_id, access_level, granted_at, clients(id, name)')
		.eq('team_member_id', params.id);

	return json(data ?? []);
};

// POST — assign a client to a team member
export const POST = async ({ request, params }: { request: Request; params: { id: string } }) => {
	const user = await requireAuth(request);
	const { client_id, access_level = 'read' } = await request.json();

	// Verify user owns the team member
	const { data: tm } = await supabaseAdmin
		.from('team_members')
		.select('id, owner_user_id')
		.eq('id', params.id)
		.single();

	if (!tm || tm.owner_user_id !== user.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const { data, error } = await supabaseAdmin
		.from('team_member_clients')
		.upsert(
			{ team_member_id: params.id, client_id, access_level, granted_by: user.id },
			{ onConflict: 'team_member_id,client_id' }
		)
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};

// DELETE — remove a client assignment
export const DELETE = async ({ request, params, url }: { request: Request; params: { id: string }; url: URL }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('client_id');
	if (!clientId) return json({ error: 'client_id required' }, { status: 400 });

	// Verify ownership
	const { data: tm } = await supabaseAdmin
		.from('team_members')
		.select('owner_user_id')
		.eq('id', params.id)
		.single();

	if (!tm || tm.owner_user_id !== user.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	await supabaseAdmin
		.from('team_member_clients')
		.delete()
		.eq('team_member_id', params.id)
		.eq('client_id', clientId);

	return json({ success: true });
};
