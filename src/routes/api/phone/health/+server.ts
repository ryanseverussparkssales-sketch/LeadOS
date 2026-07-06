import { json } from '@sveltejs/kit';
import { requireAuth, getEffectiveUserId, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET /api/phone/health — per-number daily utilization + 7-day call volume.
//
// Attribution: calls are attributed to a number via calls.phone_number_id
// (FK → phone_numbers.id, set when a call is placed/received on a specific
// number). calls.from_number also exists but is free-text; the FK is the
// reliable link, so it's what we group on.
//
// Schema tolerance: phone_numbers.daily_limit is added by
// db/legacy/phone-number-health-migration.sql and is NOT in the baseline
// schema, so we select * and default missing values in JS (100 when null).

interface HealthRow {
	id: string;
	phone_number: string;
	friendly_name: string | null;
	status: string;
	calls_today: number;
	daily_limit: number;
	utilization: number; // % of daily_limit used today, rounded
	sevenDay: number[]; // per-day attributed call counts, oldest → newest (7 entries)
	sevenDayTotal: number;
	last_used_at: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(iso: string): string {
	return new Date(iso).toISOString().slice(0, 10);
}

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data: nums } = await supabaseAdmin
		.from('phone_numbers')
		.select('*')
		.eq('user_id', ownerId)
		.order('is_primary', { ascending: false })
		.order('created_at');

	const numbers = (nums ?? []) as Record<string, unknown>[];
	if (numbers.length === 0) return json({ numbers: [], warnings: 0 });

	const ids = numbers.map((n) => n.id as string);
	const now = Date.now();
	const windowStart = new Date(now - 7 * DAY_MS).toISOString();

	// The 7 calendar-day buckets (UTC), oldest → newest, ending today.
	const dayKeys: string[] = [];
	for (let i = 6; i >= 0; i--) {
		dayKeys.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10));
	}

	// One grouped query over calls for the whole window; aggregation happens in
	// JS since supabase-js has no GROUP BY. Capped at 10k rows — beyond that the
	// per-day counts become approximate, which is acceptable for a health bar.
	const { data: callRows } = await supabaseAdmin
		.from('calls')
		.select('phone_number_id, created_at')
		.eq('user_id', ownerId)
		.in('phone_number_id', ids)
		.gte('created_at', windowStart)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(10000);

	const agg = new Map<string, { total: number; days: Map<string, number>; last: string | null }>();
	for (const row of callRows ?? []) {
		const pid = row.phone_number_id as string;
		if (!pid || !row.created_at) continue;
		let entry = agg.get(pid);
		if (!entry) {
			entry = { total: 0, days: new Map(), last: null };
			agg.set(pid, entry);
		}
		entry.total++;
		const k = dayKey(row.created_at as string);
		entry.days.set(k, (entry.days.get(k) ?? 0) + 1);
		// Rows arrive newest-first, so the first one seen per number is the max.
		if (!entry.last) entry.last = row.created_at as string;
	}

	// last_used_at for numbers with no call inside the window: one lightweight
	// lookup each (numbers per owner are few, so this stays cheap).
	const staleIds = ids.filter((id) => !agg.has(id));
	const staleLastUsed = new Map<string, string>();
	await Promise.all(
		staleIds.map(async (id) => {
			const { data } = await supabaseAdmin
				.from('calls')
				.select('created_at')
				.eq('user_id', ownerId)
				.eq('phone_number_id', id)
				.is('deleted_at', null)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			if (data?.created_at) staleLastUsed.set(id, data.created_at as string);
		})
	);

	const result: HealthRow[] = numbers.map((n) => {
		const id = n.id as string;
		const callsToday = Number(n.calls_today ?? 0);
		const rawLimit = Number(n.daily_limit ?? NaN);
		// Fallback matches the DB default in migration 0010 (daily_limit int NOT NULL DEFAULT 200)
		const dailyLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 200;
		const a = agg.get(id);
		return {
			id,
			phone_number: n.phone_number as string,
			friendly_name: (n.friendly_name as string | null) ?? null,
			status: (n.status as string) ?? 'active',
			calls_today: callsToday,
			daily_limit: dailyLimit,
			utilization: Math.round((callsToday / dailyLimit) * 100),
			sevenDay: dayKeys.map((k) => a?.days.get(k) ?? 0),
			sevenDayTotal: a?.total ?? 0,
			last_used_at: a?.last ?? staleLastUsed.get(id) ?? null,
		};
	});

	const warnings = result.filter((r) => r.utilization >= 80).length;
	return json({ numbers: result, warnings });
};
