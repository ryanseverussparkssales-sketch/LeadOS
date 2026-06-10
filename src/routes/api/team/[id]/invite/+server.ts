import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { sendInviteEmail } from '$lib/server/teamInvite';
import type { RequestHandler } from './$types';

// POST /api/team/[id]/invite — send (or resend) the invite for a roster member
export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	const { data: member, error: mErr } = await supabaseAdmin
		.from('team_members')
		.select('id, member_email, member_user_id, status')
		.eq('id', params.id)
		.eq('owner_user_id', user.id)
		.maybeSingle();
	if (mErr) throw error(400, mErr.message);
	if (!member) throw error(404, 'Team member not found');
	if (member.status === 'active') throw error(409, 'This member is already active');

	// Link to an existing auth user if one matches
	const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
	const matchedUser = authUsers?.users?.find(u => u.email?.toLowerCase() === member.member_email.toLowerCase());

	const { data: updated, error: uErr } = await supabaseAdmin
		.from('team_members')
		.update({
			status: matchedUser ? 'active' : 'pending',
			member_user_id: matchedUser?.id ?? member.member_user_id,
			invited_at: new Date().toISOString(),
		})
		.eq('id', member.id)
		.eq('owner_user_id', user.id)
		.select()
		.single();
	if (uErr) throw error(400, uErr.message);

	const emailSent = await sendInviteEmail(user.email ?? 'Your team', member.member_email);
	return json({ ...updated, email_sent: emailSent });
};
