import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * Weighted pipeline forecast rollup.
 *
 * GET /api/deals/forecast →
 * {
 *   pipeline:   { weighted, best, count },              // all open deals
 *   commit:     { weighted, best, count },              // probability >= 75
 *   thisMonth:  { weighted, best, count },              // expected_close in current month
 *   nextMonth:  { weighted, best, count },
 *   thisQuarter:{ weighted, best, count },
 *   noCloseDate:{ weighted, best, count },
 *   wonThisMonth:   { value, count },
 *   wonThisQuarter: { value, count },
 *   byStage: [{ stage, weighted, best, count }]
 * }
 *
 * weighted = Σ value × probability/100 ("expected"), best = Σ value ("best case").
 */

type Bucket = { weighted: number; best: number; count: number };
const bucket = (): Bucket => ({ weighted: 0, best: 0, count: 0 });
const add = (b: Bucket, value: number, probability: number) => {
	b.weighted += value * (probability / 100);
	b.best += value;
	b.count += 1;
};
const round = (b: Bucket): Bucket => ({ weighted: Math.round(b.weighted), best: Math.round(b.best), count: b.count });

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const rawClientId = url.searchParams.get('client_id')?.trim() ?? '';
	const clientId = rawClientId && UUID_RE.test(rawClientId) ? rawClientId : '';

	const now = new Date();
	const y = now.getFullYear();
	const m = now.getMonth();
	const monthStart = new Date(y, m, 1);
	const monthEnd = new Date(y, m + 1, 1);
	const nextMonthEnd = new Date(y, m + 2, 1);
	const qStartMonth = Math.floor(m / 3) * 3;
	const quarterStart = new Date(y, qStartMonth, 1);
	const quarterEnd = new Date(y, qStartMonth + 3, 1);

	// Open deals for pipeline buckets; won deals this quarter for actuals.
	let openQuery = supabaseAdmin
		.from('deals')
		.select('value, probability, stage, expected_close')
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.not('stage', 'in', '(won,lost)');
	if (clientId) openQuery = openQuery.eq('client_id', clientId);
	let wonQuery = supabaseAdmin
		.from('deals')
		.select('value, won_at')
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.eq('stage', 'won')
		.gte('won_at', quarterStart.toISOString());
	if (clientId) wonQuery = wonQuery.eq('client_id', clientId);
	const [{ data: open }, { data: won }] = await Promise.all([
		openQuery.limit(5000),
		wonQuery.limit(5000),
	]);

	const pipeline = bucket();
	const commit = bucket();
	const thisMonth = bucket();
	const nextMonth = bucket();
	const thisQuarter = bucket();
	const noCloseDate = bucket();
	const stageMap = new Map<string, Bucket>();

	for (const d of open ?? []) {
		const value = Number(d.value ?? 0);
		const prob = Number(d.probability ?? 0);
		add(pipeline, value, prob);
		if (prob >= 75) add(commit, value, prob);

		if (!stageMap.has(d.stage)) stageMap.set(d.stage, bucket());
		add(stageMap.get(d.stage)!, value, prob);

		if (!d.expected_close) {
			add(noCloseDate, value, prob);
			continue;
		}
		const close = new Date(d.expected_close);
		if (close >= monthStart && close < monthEnd) add(thisMonth, value, prob);
		else if (close >= monthEnd && close < nextMonthEnd) add(nextMonth, value, prob);
		if (close >= quarterStart && close < quarterEnd) add(thisQuarter, value, prob);
	}

	const wonThisQuarter = { value: 0, count: 0 };
	const wonThisMonth = { value: 0, count: 0 };
	for (const d of won ?? []) {
		const value = Number(d.value ?? 0);
		wonThisQuarter.value += value;
		wonThisQuarter.count += 1;
		if (d.won_at && new Date(d.won_at) >= monthStart) {
			wonThisMonth.value += value;
			wonThisMonth.count += 1;
		}
	}
	wonThisQuarter.value = Math.round(wonThisQuarter.value);
	wonThisMonth.value = Math.round(wonThisMonth.value);

	return json({
		pipeline: round(pipeline),
		commit: round(commit),
		thisMonth: round(thisMonth),
		nextMonth: round(nextMonth),
		thisQuarter: round(thisQuarter),
		noCloseDate: round(noCloseDate),
		wonThisMonth,
		wonThisQuarter,
		byStage: [...stageMap.entries()].map(([stage, b]) => ({ stage, ...round(b) })),
	});
};
