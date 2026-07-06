import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * POST /api/clients/onboard — one-submit client onboarding wizard.
 *
 * Body: {
 *   clientName: string,          // required
 *   clientEmail?: string,
 *   campaignName: string,        // required
 *   callListName?: string,       // defaults to "<campaignName> List"
 *   sdrIds?: string[],           // team_members.id values (validated against this owner)
 *   dailyCallGoal?: number,
 *   scriptNotes?: string,        // optional — creates a scripts row (best-effort, non-fatal)
 * }
 *
 * Creates, in order, all scoped to the effective owner:
 *   client → project → campaign → call list → campaign_sdrs (+ optional script).
 * On failure: best-effort cleanup of prior inserts (reverse order), returns 500
 * with which step failed.
 *
 * Returns: { clientId, projectId, campaignId, callListId, assignedSdrs, scriptCreated }
 */
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
	const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim() : '';
	const campaignName = typeof body.campaignName === 'string' ? body.campaignName.trim() : '';
	const callListName = typeof body.callListName === 'string' ? body.callListName.trim() : '';
	const scriptNotes = typeof body.scriptNotes === 'string' ? body.scriptNotes.trim() : '';
	const dailyCallGoal = Number.isFinite(Number(body.dailyCallGoal)) && Number(body.dailyCallGoal) > 0
		? Math.floor(Number(body.dailyCallGoal))
		: null;
	const sdrIds = Array.isArray(body.sdrIds)
		? (body.sdrIds as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0)
		: [];

	if (!clientName) throw error(400, 'clientName required');
	if (!campaignName) throw error(400, 'campaignName required');

	// Track created rows so we can clean up in reverse order on failure.
	let clientId: string | null = null;
	let projectId: string | null = null;
	let campaignId: string | null = null;
	let callListId: string | null = null;
	let sdrRowsInserted = false;

	async function cleanup() {
		// Best-effort, reverse creation order. Errors are logged, not thrown.
		try {
			if (sdrRowsInserted && campaignId) {
				await supabaseAdmin.from('campaign_sdrs').delete()
					.eq('campaign_id', campaignId).eq('owner_user_id', ownerId);
			}
			if (callListId) {
				await supabaseAdmin.from('call_lists').delete()
					.eq('id', callListId).eq('user_id', ownerId);
			}
			if (campaignId) {
				await supabaseAdmin.from('campaigns').delete().eq('id', campaignId);
			}
			if (projectId) {
				await supabaseAdmin.from('projects').delete().eq('id', projectId);
			}
			if (clientId) {
				await supabaseAdmin.from('clients').delete()
					.eq('id', clientId).eq('user_id', ownerId);
			}
		} catch (cleanupErr) {
			console.error('[clients/onboard] cleanup error:', cleanupErr);
		}
	}

	function fail(step: string, message: string) {
		console.error(`[clients/onboard] step "${step}" failed:`, message);
		return json({ error: `Onboarding failed at step: ${step}`, step, detail: message }, { status: 500 });
	}

	// ── Step 0: validate SDR ids up front (before creating anything) ──────────
	// Every sdrId must be a team_member of THIS owner — supabaseAdmin bypasses
	// RLS, so tenancy is enforced here in code.
	let validSdrIds: string[] = [];
	if (sdrIds.length > 0) {
		const { data: members, error: memberErr } = await supabaseAdmin
			.from('team_members')
			.select('id')
			.eq('owner_user_id', ownerId)
			.in('id', sdrIds);
		if (memberErr) return fail('validate_sdrs', memberErr.message);
		const found = new Set((members ?? []).map(m => m.id));
		const invalid = sdrIds.filter(id => !found.has(id));
		if (invalid.length > 0) throw error(400, 'One or more selected SDRs are not on your team');
		validSdrIds = sdrIds;
	}

	// ── Step 1: client ─────────────────────────────────────────────────────────
	{
		const { data, error: e } = await supabaseAdmin
			.from('clients')
			.insert({
				user_id: ownerId,
				name: clientName,
				primary_contact_email: clientEmail || null,
				contract_status: 'active',
			})
			.select('id')
			.single();
		if (e || !data) return fail('client', e?.message ?? 'insert returned no row');
		clientId = data.id;
	}

	// ── Step 2: project ────────────────────────────────────────────────────────
	{
		const { data, error: e } = await supabaseAdmin
			.from('projects')
			.insert({
				client_id: clientId,
				name: `${clientName} — Default`,
				user_id: ownerId,
			})
			.select('id')
			.single();
		if (e || !data) { await cleanup(); return fail('project', e?.message ?? 'insert returned no row'); }
		projectId = data.id;
	}

	// ── Step 3: campaign ───────────────────────────────────────────────────────
	{
		const { data, error: e } = await supabaseAdmin
			.from('campaigns')
			.insert({
				project_id: projectId,
				name: campaignName,
				status: 'draft',
				campaign_type: 'call',
				win_outcome: 'appointment_set',
				win_label: 'Appointment Set',
				daily_call_goal: dailyCallGoal,
				is_test: false,
			})
			.select('id')
			.single();
		if (e || !data) { await cleanup(); return fail('campaign', e?.message ?? 'insert returned no row'); }
		campaignId = data.id;
	}

	// ── Step 4: call list ──────────────────────────────────────────────────────
	{
		const { data, error: e } = await supabaseAdmin
			.from('call_lists')
			.insert({
				campaign_id: campaignId,
				project_id: projectId,
				name: callListName || `${campaignName} List`,
				status: 'active',
				user_id: ownerId,
			})
			.select('id')
			.single();
		if (e || !data) { await cleanup(); return fail('call_list', e?.message ?? 'insert returned no row'); }
		callListId = data.id;
	}

	// ── Step 5: SDR assignments ────────────────────────────────────────────────
	if (validSdrIds.length > 0) {
		const { error: e } = await supabaseAdmin
			.from('campaign_sdrs')
			.insert(validSdrIds.map(sdrId => ({
				campaign_id: campaignId,
				sdr_id: sdrId,
				owner_user_id: ownerId,
			})));
		if (e) { await cleanup(); return fail('campaign_sdrs', e.message); }
		sdrRowsInserted = true;
	}

	// ── Step 6: optional script from notes (best-effort — never aborts) ────────
	let scriptCreated = false;
	if (scriptNotes) {
		const { error: e } = await supabaseAdmin
			.from('scripts')
			.insert({
				user_id: ownerId,
				client_id: clientId,
				campaign_id: campaignId,
				title: `${campaignName} — Onboarding Notes`,
				opener: scriptNotes,
				is_default: false,
			});
		if (e) console.error('[clients/onboard] script insert skipped:', e.message);
		else scriptCreated = true;
	}

	return json({
		clientId,
		projectId,
		campaignId,
		callListId,
		assignedSdrs: validSdrIds.length,
		scriptCreated,
	}, { status: 201 });
};
