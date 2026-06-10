import { json } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET /api/admin/health — platform ops snapshot for super-admins:
// cron job status, recent inbound/outbound call volume, suspended accounts, and
// AI/voice spend over the last 24h.
export const GET: RequestHandler = async ({ request }) => {
	await requireSuperAdmin(request);
	const dayAgo = new Date(Date.now() - 86400000).toISOString();

	const [cronRes, calls24Res, vm24Res, suspendedRes, spend24Res] = await Promise.all([
		supabaseAdmin.from('cron_logs').select('job_name, last_run, last_result, details').order('last_run', { ascending: false }),
		supabaseAdmin.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
		supabaseAdmin.from('voicemails').select('id', { count: 'exact', head: true }).gte('received_at', dayAgo),
		supabaseAdmin.from('account_overrides').select('user_id, suspended_reason, suspended_at').eq('suspended', true),
		supabaseAdmin.from('api_usage_log').select('total_cost').gte('created_at', dayAgo).limit(20000),
	]);

	// Flag a cron job stale if it hasn't run within ~2× its expected cadence.
	const STALE_MS: Record<string, number> = {
		'/api/gmail/sync': 15 * 60_000,        // every 5m → stale after 15m
		'gmail-sync': 15 * 60_000,
		'daily-reset': 28 * 3600_000,          // daily
		'client-reports': 8 * 86400_000,       // weekly
		'sequences-advance': 28 * 3600_000,    // daily
	};
	const now = Date.now();
	const cron = (cronRes.data ?? []).map((c) => {
		const last = c.last_run ? new Date(c.last_run).getTime() : 0;
		const budget = STALE_MS[c.job_name] ?? 28 * 3600_000;
		return {
			job_name: c.job_name,
			last_run: c.last_run,
			last_result: c.last_result,
			stale: !last || now - last > budget,
		};
	});

	const spend24 = (spend24Res.data ?? []).reduce((s, r) => s + (r.total_cost ?? 0), 0);

	return json({
		cron,
		calls24h: calls24Res.count ?? 0,
		voicemails24h: vm24Res.count ?? 0,
		spend24h: spend24,
		suspended: suspendedRes.data ?? [],
		generatedAt: new Date().toISOString(),
	});
};
