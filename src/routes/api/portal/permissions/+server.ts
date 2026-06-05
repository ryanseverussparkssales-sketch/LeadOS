import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Default permissions — all ON unless explicitly disabled by admin
const SDR_DEFAULTS = {
	coaching: true, interview: true, profile: true,
	bonus_visible: true, performance: true, dossier: true,
	scripts: true, callbacks: true, messages: true,
};

const CLIENT_DEFAULTS = {
	wins_tab: true, approvals_tab: true, invoices_tab: true,
	messages_tab: true, rep_names_visible: true, call_details_visible: true,
};

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	const { data: membership } = await supabaseAdmin
		.from('team_members')
		.select('role, portal_access, permissions')
		.eq('member_user_id', user.id)
		.maybeSingle();

	if (!membership) {
		// Owner — full permissions
		return json({ role: 'admin', permissions: { ...SDR_DEFAULTS, ...CLIENT_DEFAULTS } });
	}

	const isClient = membership.portal_access === true;
	const defaults = isClient ? CLIENT_DEFAULTS : SDR_DEFAULTS;
	const permissions = { ...defaults, ...(membership.permissions ?? {}) };

	return json({ role: isClient ? 'client' : 'sdr', permissions });
};

// PATCH: admin updates a team member's permissions
export const PATCH: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { membershipId, permissions } = await request.json();

	// Verify the membership belongs to this admin
	const { data: membership } = await supabaseAdmin
		.from('team_members')
		.select('id, owner_user_id')
		.eq('id', membershipId)
		.eq('owner_user_id', user.id)
		.maybeSingle();

	if (!membership) return json({ error: 'Not found' }, { status: 404 });

	const { error } = await supabaseAdmin
		.from('team_members')
		.update({ permissions })
		.eq('id', membershipId);

	if (error) return json({ error: error.message }, { status: 400 });
	return json({ ok: true });
};
