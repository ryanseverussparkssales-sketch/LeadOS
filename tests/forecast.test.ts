/**
 * Weighted pipeline forecast — src/routes/api/deals/forecast/+server.ts
 *
 * The bucket math (weighted = Σ value × probability/100, month/quarter windows,
 * commit ≥ 75, rounding) is module-private, so it is exercised through the GET
 * handler with supabase auth + queries mocked.
 *
 * "Now" is frozen mid-month/mid-quarter (2026-05-15) and all fixture dates sit
 * ≥ 2 days from month boundaries, so the local-timezone month math is stable
 * regardless of the host TZ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/server/supabase', async () => {
	const { createSupabaseMock } = await import('./helpers/supabaseMock');
	const mock = createSupabaseMock();
	return {
		supabaseAdmin: mock.supabaseAdmin,
		requireAuth: vi.fn(async () => ({ id: 'user-1' })),
		getEffectiveUserId: vi.fn(async (id: string) => `owner-of-${id}`),
		__mock: mock,
	};
});

import { GET } from '../src/routes/api/deals/forecast/+server';
import type { SupabaseMock } from './helpers/supabaseMock';

const sb = ((await import('$lib/server/supabase')) as any).__mock as SupabaseMock;

function get(query = '') {
	const url = new URL(`http://localhost/api/deals/forecast${query}`);
	return GET({ request: new Request(url), url } as any);
}

beforeEach(() => {
	sb.reset();
	vi.useFakeTimers({ now: new Date('2026-05-15T12:00:00Z') }); // mid-May, Q2
});
afterEach(() => vi.useRealTimers());

describe('GET /api/deals/forecast', () => {
	it('rolls open deals into weighted/best buckets by close-date window', async () => {
		sb.queue('deals', {
			data: [
				// this month + quarter, commit-grade
				{ value: 1000, probability: 80, stage: 'proposal', expected_close: '2026-05-20' },
				// next month + this quarter
				{ value: 500, probability: 50, stage: 'discovery', expected_close: '2026-06-10' },
				// no close date
				{ value: 2000, probability: 10, stage: 'discovery', expected_close: null },
			],
		});
		sb.queue('deals', {
			data: [
				{ value: 300, won_at: '2026-05-10T00:00:00Z' }, // this month
				{ value: 700, won_at: '2026-04-10T00:00:00Z' }, // this quarter only
			],
		});

		const res = await get();
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.pipeline).toEqual({ weighted: 1250, best: 3500, count: 3 }); // 800+250+200
		expect(body.commit).toEqual({ weighted: 800, best: 1000, count: 1 }); // only prob ≥ 75
		expect(body.thisMonth).toEqual({ weighted: 800, best: 1000, count: 1 });
		expect(body.nextMonth).toEqual({ weighted: 250, best: 500, count: 1 });
		expect(body.thisQuarter).toEqual({ weighted: 1050, best: 1500, count: 2 });
		expect(body.noCloseDate).toEqual({ weighted: 200, best: 2000, count: 1 });
		expect(body.wonThisMonth).toEqual({ value: 300, count: 1 });
		expect(body.wonThisQuarter).toEqual({ value: 1000, count: 2 });
		expect(body.byStage).toEqual(
			expect.arrayContaining([
				{ stage: 'proposal', weighted: 800, best: 1000, count: 1 },
				{ stage: 'discovery', weighted: 450, best: 2500, count: 2 },
			]),
		);
		expect(body.byStage).toHaveLength(2);
	});

	it('rounds weighted values and tolerates null value/probability', async () => {
		sb.queue('deals', {
			data: [
				{ value: 333, probability: 33, stage: 'demo', expected_close: null }, // 109.89 → 110
				{ value: null, probability: null, stage: 'demo', expected_close: null }, // 0
			],
		});
		sb.queue('deals', { data: [] });

		const body = await (await get()).json();
		expect(body.pipeline).toEqual({ weighted: 110, best: 333, count: 2 });
		expect(body.commit).toEqual({ weighted: 0, best: 0, count: 0 });
	});

	it('empty pipeline returns all-zero buckets', async () => {
		sb.queue('deals', { data: [] });
		sb.queue('deals', { data: null });

		const body = await (await get()).json();
		expect(body.pipeline).toEqual({ weighted: 0, best: 0, count: 0 });
		expect(body.wonThisQuarter).toEqual({ value: 0, count: 0 });
		expect(body.byStage).toEqual([]);
	});

	it('scopes both queries to the effective owner and applies a valid client_id filter', async () => {
		const cid = '11111111-2222-3333-4444-555555555555';
		sb.queue('deals', { data: [] });
		sb.queue('deals', { data: [] });
		await get(`?client_id=${cid}`);

		const dealCalls = sb.calls.filter((c) => c.table === 'deals');
		expect(dealCalls).toHaveLength(2);
		for (const call of dealCalls) {
			expect(call.ops).toContainEqual({ method: 'eq', args: ['user_id', 'owner-of-user-1'] });
			expect(call.ops).toContainEqual({ method: 'eq', args: ['client_id', cid] });
		}
	});

	it('ignores a malformed client_id instead of filtering on attacker input', async () => {
		sb.queue('deals', { data: [] });
		sb.queue('deals', { data: [] });
		await get(`?client_id=1%20OR%201=1`);

		const dealCalls = sb.calls.filter((c) => c.table === 'deals');
		for (const call of dealCalls) {
			expect(call.ops.some((o) => o.method === 'eq' && o.args[0] === 'client_id')).toBe(false);
		}
	});
});
