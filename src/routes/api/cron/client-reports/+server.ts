/**
 * Weekly client report cron — runs every Monday at 8am UTC
 * Add to vercel.json crons: { "path": "/api/cron/client-reports", "schedule": "0 8 * * 1" }
 *
 * For each client:
 * - Pull last 7 days of calls, appointments, connect rate
 * - Compare vs previous 7 days
 * - Send email to client portal users + owner
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { sendEmail } from '$lib/server/email';

export const GET = async ({ request }: { request: Request }) => {
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const now = new Date();
	const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
	const prevWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString();

	const WIN_OUTCOMES = ['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','follow_up_agreed'];

	// Get all owners (agency accounts) — `settings` table doesn't exist; the real
	// table is user_settings (company_email serves as the from/CC address).
	const { data: owners } = await supabaseAdmin
		.from('user_settings')
		.select('user_id, agency_name, agency_email_from:company_email')
		.not('agency_name', 'is', null);

	let sentCount = 0;

	for (const owner of owners ?? []) {
		// Get all clients for this owner
		const { data: clients } = await supabaseAdmin
			.from('clients')
			.select('id, name, primary_contact_email')
			.eq('user_id', owner.user_id);

		for (const client of clients ?? []) {
			// Get calls for this client's contacts this week
			const { data: contacts } = await supabaseAdmin
				.from('contact_client_assoc')
				.select('contact_id')
				.eq('client_id', client.id)
				.eq('user_id', owner.user_id);

			const contactIds = (contacts ?? []).map(c => c.contact_id);
			if (!contactIds.length) continue;

			const [thisWeekCalls, prevWeekCalls] = await Promise.all([
				supabaseAdmin.from('calls').select('id, outcome, call_duration_seconds, created_at, contact:contacts(name, company)')
					.in('contact_id', contactIds)
					.gte('created_at', weekStart)
					.order('created_at', { ascending: false }),
				supabaseAdmin.from('calls').select('id, outcome')
					.in('contact_id', contactIds)
					.gte('created_at', prevWeekStart)
					.lt('created_at', weekStart),
			]);

			const calls = thisWeekCalls.data ?? [];
			const prevCalls = prevWeekCalls.data ?? [];

			if (calls.length === 0 && prevCalls.length === 0) continue;

			const wins = calls.filter(c => WIN_OUTCOMES.includes(c.outcome ?? ''));
			const answered = calls.filter(c => c.outcome === 'answered' || WIN_OUTCOMES.includes(c.outcome ?? ''));
			const prevWins = prevCalls.filter(c => WIN_OUTCOMES.includes(c.outcome ?? ''));
			const connectRate = calls.length > 0 ? Math.round((answered.length / calls.length) * 100) : 0;
			const prevConnectRate = prevCalls.length > 0 ? Math.round((prevCalls.filter(c => ['answered',...WIN_OUTCOMES].includes(c.outcome ?? '')).length / prevCalls.length) * 100) : 0;

			// Build email HTML
			const trend = (n: number, p: number) => n > p ? `↑ ${n - p}` : n < p ? `↓ ${p - n}` : '→ same';
			const weekLabel = `${new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

			const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 12px; padding: 32px; max-width: 560px; margin: 0 auto; }
  .header { margin-bottom: 24px; }
  .title { font-size: 20px; font-weight: 700; color: #111; margin: 0 0 4px; }
  .subtitle { font-size: 13px; color: #888; margin: 0; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
  .stat { background: #f9f9f9; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-value { font-size: 28px; font-weight: 700; color: #111; }
  .stat-label { font-size: 11px; color: #888; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-trend { font-size: 11px; color: #16a34a; margin-top: 4px; }
  .wins-title { font-size: 13px; font-weight: 600; color: #111; margin: 24px 0 12px; }
  .win-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #f0f0f0; }
  .win-name { font-size: 13px; color: #111; font-weight: 500; }
  .win-co { font-size: 11px; color: #888; }
  .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #aaa; }
  .cta { display: inline-block; background: #111; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; margin-top: 16px; }
</style></head>
<body>
<div class="card">
  <div class="header">
    <p class="title">${client.name} — Weekly Report</p>
    <p class="subtitle">${weekLabel} · ${owner.agency_name ?? 'Your Agency'}</p>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-value">${calls.length}</div>
      <div class="stat-label">Calls Made</div>
      <div class="stat-trend">${trend(calls.length, prevCalls.length)} vs last week</div>
    </div>
    <div class="stat">
      <div class="stat-value">${connectRate}%</div>
      <div class="stat-label">Connect Rate</div>
      <div class="stat-trend">${trend(connectRate, prevConnectRate)}% vs last week</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: #16a34a">${wins.length}</div>
      <div class="stat-label">Appointments</div>
      <div class="stat-trend">${trend(wins.length, prevWins.length)} vs last week</div>
    </div>
  </div>

  ${wins.length > 0 ? `
  <div class="wins-title">🎯 Appointments Set This Week</div>
  ${wins.slice(0, 5).map(w => `
    <div class="win-row">
      <div>
        <div class="win-name">${(w.contact as any)?.name ?? 'Contact'}</div>
        <div class="win-co">${(w.contact as any)?.company ?? ''} · ${new Date(w.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      </div>
    </div>
  `).join('')}
  ${wins.length > 5 ? `<p style="font-size:11px;color:#888;margin-top:8px">+ ${wins.length - 5} more appointments</p>` : ''}
  ` : '<p style="color:#888;font-size:13px;margin:16px 0">No appointments set this week — the team is working the pipeline.</p>'}

  <a href="${env.PUBLIC_SITE_URL ?? 'https://lead-os-livid.vercel.app'}/client-portal" class="cta">View Full Report →</a>

  <div class="footer">
    Sent by ${owner.agency_name ?? 'Edelhaus'} · <a href="${env.PUBLIC_SITE_URL ?? ''}/client-portal" style="color:#aaa">View portal</a>
  </div>
</div>
</body>
</html>`;

			// Find recipient emails: client portal users + client primary contact
			const { data: portalUsers } = await supabaseAdmin
				.from('team_members')
				.select('member_email')
				.eq('client_id', client.id)
				.eq('portal_access', true);

			const recipients = [
				...((portalUsers ?? []).map(u => u.member_email)),
				...(client.primary_contact_email ? [client.primary_contact_email] : []),
			].filter(Boolean);

			// Also CC owner
			const { data: ownerSettings } = await supabaseAdmin
				.from('user_settings').select('email:company_email').eq('user_id', owner.user_id).maybeSingle();

			for (const to of [...new Set(recipients)]) {
				try {
					await sendEmail({
						to,
						userId: owner.user_id,
						cc: ownerSettings?.email ?? undefined,
						subject: `${client.name} — Weekly Outreach Report (${calls.length} calls, ${wins.length} appointments)`,
						html,
						text: `${client.name} Weekly Report: ${calls.length} calls, ${connectRate}% connect rate, ${wins.length} appointments set. View full report: ${env.PUBLIC_SITE_URL}/client-portal`,
					});
					sentCount++;
				} catch (err) {
					console.error(`[client-reports] failed to send to ${to}:`, err);
				}
			}
		}
	}

	return json({ ok: true, sent: sentCount, timestamp: now.toISOString() });
};
