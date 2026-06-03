import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('team_members')
		.select('*')
		.eq('owner_user_id', user.id)
		.order('invited_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { email, role, clientId, portalAccess } = await request.json();
	if (!email?.trim()) throw error(400, 'email required');

	// Check if already invited
	const { data: existing } = await supabaseAdmin
		.from('team_members').select('id').eq('owner_user_id', user.id).eq('member_email', email.toLowerCase()).maybeSingle();
	if (existing) throw error(409, 'This person is already invited');

	// Check if they're already a Supabase user
	const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
	const matchedUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

	const { data, error: e } = await supabaseAdmin
		.from('team_members')
		.insert({
			owner_user_id: user.id,
			member_email: email.toLowerCase(),
			member_user_id: matchedUser?.id ?? null,
			role: role ?? 'agent',
			status: matchedUser ? 'active' : 'pending',
			client_id: clientId ?? null,
			portal_access: portalAccess ?? false,
		})
		.select()
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};
