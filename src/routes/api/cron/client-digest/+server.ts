/**
 * Weekly client digest cron — Workstream 1B
 * Schedule (vercel.json): { "path": "/api/cron/client-digest", "schedule": "0 13 * * 1" }
 * — Mondays 13:00 UTC.
 *
 * Auth: Vercel Cron passes Authorization: Bearer <CRON_SECRET>, same convention
 * as /api/cron/daily-reset and /api/sequences/advance.
 *
 * Iterates every client with digest_enabled = true (each scoped to its own
 * owner via clients.user_id), sends the last-7-days digest, and tolerates
 * individual failures. Time-boxed to ~40 s — anything not reached is reported
 * as skipped so the run never exceeds the serverless window.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { sendClientDigest, type DigestClientRow } from '$lib/server/clientDigest';

const TIME_BUDGET_MS = 40_000;

export const GET = async ({ request }: { request: Request }) => {
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const startedAt = Date.now();

	// All opted-in clients across owners. user_id on each row is that client's
	// owner — every downstream query in sendClientDigest is scoped to it.
	const { data: clients, error: listError } = await supabaseAdmin
		.from('clients')
		.select('id, user_id, name, digest_email, primary_contact_email')
		.eq('digest_enabled', true)
		.is('deleted_at', null)
		.eq('is_test', false)
		.limit(500);

	if (listError) {
		return json({ error: listError.message }, { status: 500 });
	}

	const queue = (clients ?? []) as (DigestClientRow & { user_id: string })[];
	let sent = 0;
	let failed = 0;
	let skipped = 0;
	const errors: string[] = [];

	for (let i = 0; i < queue.length; i++) {
		// Time-box: report everything not yet processed as skipped.
		if (Date.now() - startedAt > TIME_BUDGET_MS) {
			skipped += queue.length - i;
			errors.push(`time budget exhausted with ${queue.length - i} clients remaining`);
			break;
		}

		const client = queue[i];
		try {
			const result = await sendClientDigest(client, client.user_id);
			if (result.sent) {
				sent++;
			} else if (result.skipped) {
				skipped++;
			} else {
				failed++;
				errors.push(`${client.name ?? client.id}: ${result.error ?? 'send failed'}`);
			}
		} catch (err) {
			failed++;
			errors.push(`${client.name ?? client.id}: ${err instanceof Error ? err.message : String(err)}`);
			console.error('[cron/client-digest] client', client.id, 'failed:', err);
		}
	}

	return json({
		sent,
		failed,
		skipped,
		total: queue.length,
		durationMs: Date.now() - startedAt,
		errors: errors.slice(0, 20),
	});
};
