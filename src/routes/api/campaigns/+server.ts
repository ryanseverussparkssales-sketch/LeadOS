import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await requireAuth(request);
		const ownerId = await getEffectiveUserId(user.id);
		const projectId = url.searchParams.get('project_id');
		const clientId = url.searchParams.get('client_id');
		const includeTest = url.searchParams.get('include_test') === 'true';

		let query = supabaseAdmin
			.from('campaigns')
			.select('*, campaign_type, description, goal, target_contacts, email_sequence_id, from_email_account_id, from_phone_number_id, win_outcome, win_label, win_count, target_wins, custom_outcomes, win_conditions, project:projects(id, name, client:clients(id, name, user_id)), call_lists(id, name, status, call_list_contacts(count)), campaign_contacts(count)')
			.is('deleted_at', null)
			.order('name')
			.limit(200);

		if (!includeTest) query = query.eq('is_test', false);

		if (projectId) {
			query = query.eq('project_id', projectId);
		} else if (clientId) {
			const { data: projects, error: projErr } = await supabaseAdmin.from('projects').select('id').eq('client_id', clientId);
			if (projErr) { console.error('[campaigns GET] projects fetch error:', projErr); return json([]); }
			const ids = projects?.map(p => p.id) ?? [];
			if (!ids.length) return json([]);
			query = query.in('project_id', ids);
		}

		const { data, error: queryErr } = await query;
		if (queryErr) { console.error('[campaigns GET] query error:', queryErr); return json([]); }

		// Filter to owner's campaigns
		const ownerCampaigns = (data ?? []).filter(c =>
			(c.project?.client as unknown as { user_id: string })?.user_id === ownerId
		);

		// If caller is an SDR (role=sdr team member), further filter to only their assigned campaigns
		const { data: sdrMembership } = await supabaseAdmin
			.from('team_members')
			.select('id, role')
			.eq('member_user_id', user.id)
			.eq('role', 'sdr')
			.maybeSingle();

		if (sdrMembership) {
			// Get campaign IDs assigned to this SDR
			const { data: assignments } = await supabaseAdmin
				.from('campaign_sdrs')
				.select('campaign_id')
				.eq('sdr_id', sdrMembership.id);
			const assignedIds = new Set((assignments ?? []).map(a => a.campaign_id));
			// Only return assigned campaigns (if none assigned yet, return all so SDR can still work)
			if (assignedIds.size > 0) {
				return json(ownerCampaigns.filter(c => assignedIds.has(c.id)));
			}
		}

		return json(ownerCampaigns);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('[campaigns GET] unhandled error:', err);
		return json([], { status: 500 });
	}
};

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

		const {
			name, project_id, campaign_type, description, goal, target_contacts, status,
			win_outcome, win_label, target_wins, daily_call_goal, custom_outcomes, win_conditions,
			email_sequence_id, from_email_account_id, from_phone_number_id,
		} = body_raw as Record<string, unknown>;

		if (!name || !project_id) throw error(400, 'name and project_id required');

		const { data, error: e } = await supabaseAdmin
			.from('campaigns')
			.insert({
				project_id, name, status: status ?? 'draft',
				campaign_type: campaign_type ?? 'call',
				description: description ?? null,
				goal: goal ?? null,
				target_contacts: target_contacts ?? null,
				win_outcome: win_outcome ?? 'appointment_set',
				win_label: win_label ?? 'Appointment Set',
				target_wins: target_wins ?? null,
				daily_call_goal: daily_call_goal ?? null,
				custom_outcomes: custom_outcomes ?? null,
				win_conditions: win_conditions ?? null,
				email_sequence_id: email_sequence_id ?? null,
				from_email_account_id: from_email_account_id ?? null,
				from_phone_number_id: from_phone_number_id ?? null,
				is_test: false,
			})
			.select('*, project:projects(id, name, client:clients(id, name, user_id))')
			.single();

		if (e) throw error(400, e.message);
		return json(data, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('[campaigns POST] unhandled error:', err);
		throw error(500, 'Internal server error');
	}
};
