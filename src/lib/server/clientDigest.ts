/**
 * Weekly client digest — Workstream 1B
 *
 * buildClientDigest(clientId, ownerId) aggregates the last 7 days of outreach
 * activity for one client (dials, connects, wins, appointments, per-campaign
 * breakdown) and renders a minimal dark-friendly HTML email.
 *
 * sendClientDigest(client, ownerId) sends it via the shared sendEmail helper
 * (SMTP account if configured for the owner/client, Resend fallback).
 *
 * Tenancy: every query is scoped to the owner. The client row is verified as
 * belonging to ownerId first; projects/campaigns/calls/appointments are then
 * reached only through that verified ownership chain (client → projects →
 * campaigns → calls), with appointments additionally filtered on
 * owner_user_id. Calls are intentionally NOT filtered on calls.user_id —
 * SDR-placed calls carry the SDR's user_id but belong to the owner's
 * campaigns, and the campaign_id IN (owner's campaigns) filter is the
 * authoritative scope.
 */

import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase';
import { sendEmail } from './email';

/** Mirrors WIN_OUTCOMES in src/routes/api/agency/+server.ts */
export const WIN_OUTCOMES = new Set([
	'appointment_set',
	'demo_scheduled',
	'meeting_confirmed',
	'signed_up',
	'callback',
	'follow_up_agreed',
	'referral',
	'proposal_requested',
]);

/** Mirrors ANSWERED_SET in src/routes/api/agency/+server.ts */
const ANSWERED_SET = new Set([
	'answered',
	'appointment_set',
	'demo_scheduled',
	'meeting_confirmed',
	'signed_up',
	'callback',
	'not_interested',
	'do_not_call',
	'follow_up_agreed',
]);

export interface CampaignDigestRow {
	id: string;
	name: string;
	dials: number;
	answered: number;
	wins: number;
}

export interface ClientDigestData {
	clientId: string;
	clientName: string;
	agencyName: string;
	weekLabel: string;
	dials: number;
	answered: number;
	connectRate: number; // 0-100
	wins: number;
	appointments: number;
	campaigns: CampaignDigestRow[];
}

export interface ClientDigest {
	data: ClientDigestData;
	html: string;
	subject: string;
}

export interface DigestClientRow {
	id: string;
	user_id: string;
	name?: string | null;
	digest_email?: string | null;
	primary_contact_email?: string | null;
}

export interface DigestSendResult {
	sent: boolean;
	/** True when nothing was wrong but there was nothing worth sending (no recipient / no activity). */
	skipped?: boolean;
	error?: string;
}

function esc(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderDigestHtml(d: ClientDigestData): string {
	const statBlock = (value: string, label: string, color = '#f5f5f5') => `
		<td width="25%" style="padding:4px;">
			<div style="background:#141414;border:1px solid #262626;border-radius:10px;padding:16px 8px;text-align:center;">
				<div style="font-size:26px;font-weight:700;color:${color};line-height:1.2;">${value}</div>
				<div style="font-size:10px;color:#9ca3af;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">${label}</div>
			</div>
		</td>`;

	const campaignRows = d.campaigns
		.map(
			(c) => `
		<tr>
			<td style="padding:8px 12px;border-top:1px solid #262626;font-size:13px;color:#f5f5f5;">${esc(c.name)}</td>
			<td style="padding:8px 12px;border-top:1px solid #262626;font-size:13px;color:#d1d5db;text-align:right;">${c.dials}</td>
			<td style="padding:8px 12px;border-top:1px solid #262626;font-size:13px;color:#d1d5db;text-align:right;">${c.answered}</td>
			<td style="padding:8px 12px;border-top:1px solid #262626;font-size:13px;color:#22c55e;text-align:right;">${c.wins}</td>
		</tr>`
		)
		.join('');

	const campaignTable =
		d.campaigns.length > 0
			? `
	<div style="font-size:12px;font-weight:600;color:#f5f5f5;margin:24px 0 8px;text-transform:uppercase;letter-spacing:0.06em;">By campaign</div>
	<table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;border-collapse:separate;overflow:hidden;">
		<tr>
			<td style="padding:8px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Campaign</td>
			<td style="padding:8px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;text-align:right;">Dials</td>
			<td style="padding:8px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;text-align:right;">Connects</td>
			<td style="padding:8px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;text-align:right;">Wins</td>
		</tr>
		${campaignRows}
	</table>`
			: `<p style="font-size:13px;color:#9ca3af;margin:20px 0 0;">No campaign activity recorded this week.</p>`;

	const siteUrl = env.PUBLIC_SITE_URL ?? 'https://lead-os-livid.vercel.app';

	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0b0b0b;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:24px 12px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0f0f0f;border:1px solid #262626;border-radius:14px;">
<tr><td style="padding:32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">

	<div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Weekly Digest · ${esc(d.weekLabel)}</div>
	<div style="font-size:21px;font-weight:700;color:#f5f5f5;margin-bottom:24px;">${esc(d.clientName)}</div>

	<table width="100%" cellpadding="0" cellspacing="0"><tr>
		${statBlock(String(d.dials), 'Dials')}
		${statBlock(String(d.answered), 'Connects')}
		${statBlock(`${d.connectRate}%`, 'Connect rate')}
		${statBlock(String(d.wins), 'Wins', '#22c55e')}
	</tr></table>

	${
		d.appointments > 0
			? `<p style="font-size:13px;color:#d1d5db;margin:16px 0 0;">📅 <strong style="color:#f5f5f5;">${d.appointments}</strong> appointment${d.appointments === 1 ? '' : 's'} booked this week.</p>`
			: ''
	}

	${campaignTable}

	<a href="${esc(siteUrl)}/client-portal" style="display:inline-block;background:#f5f5f5;color:#0b0b0b;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:24px;">View full report →</a>

	<div style="margin-top:28px;padding-top:16px;border-top:1px solid #262626;font-size:11px;color:#6b7280;">
		Sent by ${esc(d.agencyName)} via RogueOS
	</div>

</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Aggregate last-7-days stats for one client's campaigns and render the email.
 * Returns null when the client doesn't exist or doesn't belong to ownerId.
 */
export async function buildClientDigest(clientId: string, ownerId: string): Promise<ClientDigest | null> {
	// 1. Verify the client belongs to this owner — everything below hangs off this check.
	const { data: client } = await supabaseAdmin
		.from('clients')
		.select('id, name, user_id')
		.eq('id', clientId)
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.maybeSingle();
	if (!client) return null;

	const now = new Date();
	const weekStart = new Date(now.getTime() - 7 * 86400000);
	const weekStartISO = weekStart.toISOString();
	const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const weekLabel = `${fmt(weekStart)} – ${fmt(now)}`;

	// 2. Agency name for the footer (owner-scoped).
	const { data: settings } = await supabaseAdmin
		.from('user_settings')
		.select('agency_name')
		.eq('user_id', ownerId)
		.maybeSingle();
	const agencyName = (settings?.agency_name as string | null) ?? 'Your agency';

	// 3. Projects → campaigns for this client (reached via the verified owner-scoped client;
	//    projects.user_id / campaigns.user_id are nullable on legacy rows, so the chain is the scope).
	const { data: projects } = await supabaseAdmin
		.from('projects')
		.select('id')
		.eq('client_id', client.id)
		.is('deleted_at', null)
		.limit(200);
	const projectIds = (projects ?? []).map((p) => p.id);

	let campaigns: { id: string; name: string }[] = [];
	if (projectIds.length > 0) {
		const { data: campaignRows } = await supabaseAdmin
			.from('campaigns')
			.select('id, name')
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.eq('is_test', false)
			.limit(500);
		campaigns = campaignRows ?? [];
	}
	const campaignIds = campaigns.map((c) => c.id);

	// 4. Calls + appointments for those campaigns, last 7 days.
	let calls: { outcome: string | null; campaign_id: string | null }[] = [];
	let appointmentCount = 0;
	if (campaignIds.length > 0) {
		const [callsRes, apptsRes] = await Promise.all([
			supabaseAdmin
				.from('calls')
				.select('outcome, campaign_id')
				.in('campaign_id', campaignIds)
				.gte('created_at', weekStartISO)
				.is('deleted_at', null)
				.limit(10000),
			supabaseAdmin
				.from('appointments')
				.select('id', { count: 'exact', head: true })
				.eq('owner_user_id', ownerId)
				.in('campaign_id', campaignIds)
				.gte('created_at', weekStartISO),
		]);
		calls = callsRes.data ?? [];
		appointmentCount = apptsRes.count ?? 0;
	}

	// 5. Aggregate totals + per-campaign breakdown in JS (one pass).
	const perCampaign = new Map<string, { dials: number; answered: number; wins: number }>();
	let dials = 0;
	let answered = 0;
	let wins = 0;
	for (const call of calls) {
		dials++;
		const outcome = call.outcome ?? '';
		const isAnswered = ANSWERED_SET.has(outcome);
		const isWin = WIN_OUTCOMES.has(outcome);
		if (isAnswered) answered++;
		if (isWin) wins++;
		if (call.campaign_id) {
			const row = perCampaign.get(call.campaign_id) ?? { dials: 0, answered: 0, wins: 0 };
			row.dials++;
			if (isAnswered) row.answered++;
			if (isWin) row.wins++;
			perCampaign.set(call.campaign_id, row);
		}
	}

	const campaignBreakdown: CampaignDigestRow[] = campaigns
		.map((c) => {
			const row = perCampaign.get(c.id) ?? { dials: 0, answered: 0, wins: 0 };
			return { id: c.id, name: c.name, ...row };
		})
		.filter((c) => c.dials > 0)
		.sort((a, b) => b.dials - a.dials)
		.slice(0, 15);

	const data: ClientDigestData = {
		clientId: client.id,
		clientName: client.name,
		agencyName,
		weekLabel,
		dials,
		answered,
		connectRate: dials > 0 ? Math.round((answered / dials) * 100) : 0,
		wins,
		appointments: appointmentCount,
		campaigns: campaignBreakdown,
	};

	return {
		data,
		html: renderDigestHtml(data),
		subject: `${client.name} — Weekly Digest (${dials} dials, ${wins} wins)`,
	};
}

/**
 * Build and send the digest for one client. Recipient: client.digest_email,
 * falling back to primary_contact_email. Never throws — returns { sent, error }.
 */
export async function sendClientDigest(client: DigestClientRow, ownerId: string): Promise<DigestSendResult> {
	try {
		const to = client.digest_email?.trim() || client.primary_contact_email?.trim() || '';
		if (!to) return { sent: false, skipped: true, error: 'no recipient email' };

		const digest = await buildClientDigest(client.id, ownerId);
		if (!digest) return { sent: false, skipped: true, error: 'client not found for owner' };

		// Nothing happened this week — don't send an empty report.
		if (digest.data.dials === 0 && digest.data.appointments === 0) {
			return { sent: false, skipped: true, error: 'no activity this week' };
		}

		const result = await sendEmail({
			to,
			subject: digest.subject,
			html: digest.html,
			text: `${digest.data.clientName} weekly digest: ${digest.data.dials} dials, ${digest.data.connectRate}% connect rate, ${digest.data.wins} wins, ${digest.data.appointments} appointments. Sent by ${digest.data.agencyName} via RogueOS.`,
			userId: ownerId,
			clientId: client.id,
		});

		if (!result.success) return { sent: false, error: result.error ?? 'send failed' };
		return { sent: true };
	} catch (err) {
		return { sent: false, error: err instanceof Error ? err.message : String(err) };
	}
}
