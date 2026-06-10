import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { sendInviteEmail } from '$lib/server/teamInvite';
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
	const { email, role, clientId, portalAccess, invite, firstName, lastName, phone } = await request.json();
	if (!email?.trim()) throw error(400, 'email required');
	const sendInvite = invite !== false; // default true (back-compat)

	// Check if already on the roster
	const { data: existing } = await supabaseAdmin
		.from('team_members').select('id').eq('owner_user_id', user.id).eq('member_email', email.toLowerCase()).maybeSingle();
	if (existing) throw error(409, 'This person is already on your team');

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
			// 'added' = on roster, not yet invited; invite endpoint moves it forward
			status: sendInvite ? (matchedUser ? 'active' : 'pending') : 'added',
			invited_at: sendInvite ? new Date().toISOString() : null,
			client_id: clientId ?? null,
			portal_access: portalAccess ?? false,
			first_name: firstName?.trim() || null,
			last_name: lastName?.trim() || null,
			phone: phone?.trim() || null,
		})
		.select()
		.single();

	if (e) throw error(400, e.message);

	if (sendInvite) {
		await sendInviteEmail(user.email ?? 'Your team', data.member_email);
	}
	return json(data);
};
