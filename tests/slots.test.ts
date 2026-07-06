/**
 * Booking slot engine — src/routes/api/booking/_lib/slots.ts
 *
 * Money path: a wrong slot here double-books an owner or hides open inventory.
 * Time is controlled with vi.useFakeTimers + a fixed "now"; the link timezone
 * is America/New_York so DST behavior is exercised explicitly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/server/supabase', async () => {
	const { createSupabaseMock } = await import('./helpers/supabaseMock');
	const mock = createSupabaseMock();
	return { supabaseAdmin: mock.supabaseAdmin, __mock: mock };
});

import {
	computeSlots,
	zonedToUtc,
	clampDays,
	fetchBusyIntervals,
	MIN_NOTICE_MS,
	type BookingLinkRow,
} from '../src/routes/api/booking/_lib/slots';
import type { SupabaseMock } from './helpers/supabaseMock';

const sb = ((await import('$lib/server/supabase')) as any).__mock as SupabaseMock;

const TZ = 'America/New_York';

const link = (over: Partial<BookingLinkRow> = {}): BookingLinkRow => ({
	id: 'l1',
	user_id: 'u1',
	slug: 'intro',
	title: 'Intro call',
	description: null,
	duration_minutes: 30,
	timezone: TZ,
	availability: { fri: [['09:00', '11:00']] },
	campaign_id: null,
	client_id: null,
	buffer_minutes: 15,
	max_days_ahead: 14,
	active: true,
	...over,
});

/** Queue the appointments the engine will fetch (or none). */
const queueAppointments = (rows: any[] | null = null) => sb.queue('appointments', { data: rows });

beforeEach(() => sb.reset());
afterEach(() => vi.useRealTimers());

describe('zonedToUtc', () => {
	it('is identity-ish for UTC', () => {
		expect(zonedToUtc('2026-03-06', '09:00', 'UTC').toISOString()).toBe('2026-03-06T09:00:00.000Z');
	});

	it('converts EST wall time (UTC-5) before the spring-forward date', () => {
		// 2026 DST starts Sun 2026-03-08 02:00 in America/New_York
		expect(zonedToUtc('2026-03-07', '09:00', TZ).toISOString()).toBe('2026-03-07T14:00:00.000Z');
	});

	it('converts EDT wall time (UTC-4) on the spring-forward date itself', () => {
		expect(zonedToUtc('2026-03-08', '09:00', TZ).toISOString()).toBe('2026-03-08T13:00:00.000Z');
	});

	it('DST-day sanity: 01:00 and 03:00 local straddle the nonexistent 02:00 hour', () => {
		// 01:00 EST = 06:00Z, 03:00 EDT = 07:00Z — 2 wall-clock hours, 1 real hour apart.
		expect(zonedToUtc('2026-03-08', '01:00', TZ).toISOString()).toBe('2026-03-08T06:00:00.000Z');
		expect(zonedToUtc('2026-03-08', '03:00', TZ).toISOString()).toBe('2026-03-08T07:00:00.000Z');
	});

	it('nonexistent spring-forward time still yields a valid instant inside the gap edges', () => {
		const t = zonedToUtc('2026-03-08', '02:30', TZ).getTime();
		expect(Number.isNaN(t)).toBe(false);
		expect(t).toBeGreaterThanOrEqual(Date.UTC(2026, 2, 8, 6, 0)); // >= 01:00 EST
		expect(t).toBeLessThanOrEqual(Date.UTC(2026, 2, 8, 7, 30)); // <= 03:30 EDT
	});

	it('converts EST again after fall-back (2026-11-01)', () => {
		expect(zonedToUtc('2026-11-01', '09:00', TZ).toISOString()).toBe('2026-11-01T14:00:00.000Z');
	});
});

describe('clampDays', () => {
	it('falls back to max_days_ahead when requested is invalid or non-positive', () => {
		expect(clampDays(link(), NaN)).toBe(14);
		expect(clampDays(link(), 0)).toBe(14);
		expect(clampDays(link(), -3)).toBe(14);
	});

	it('defaults max to 14 when max_days_ahead is null', () => {
		expect(clampDays(link({ max_days_ahead: null }), 99)).toBe(14);
	});

	it('caps requested at max_days_ahead and hard-caps at 60', () => {
		expect(clampDays(link({ max_days_ahead: 30 }), 45)).toBe(30);
		expect(clampDays(link({ max_days_ahead: 500 }), 200)).toBe(60);
	});

	it('floors fractional requests and respects small maxes', () => {
		expect(clampDays(link({ max_days_ahead: 30 }), 7.9)).toBe(7);
		expect(clampDays(link({ max_days_ahead: 0 }), 5)).toBe(1); // max clamped up to 1
	});
});

describe('fetchBusyIntervals', () => {
	it('pads by buffer, defaults duration to 30, and drops cancelled/no-show/invalid rows', async () => {
		queueAppointments([
			{ scheduled_at: '2026-03-06T15:00:00Z', duration_minutes: 30, status: 'scheduled' },
			{ scheduled_at: '2026-03-06T18:00:00Z', duration_minutes: null, status: 'booked' },
			{ scheduled_at: '2026-03-06T20:00:00Z', duration_minutes: 60, status: 'cancelled' },
			{ scheduled_at: '2026-03-06T21:00:00Z', duration_minutes: 60, status: 'no_show' },
			{ scheduled_at: null, duration_minutes: 30, status: 'scheduled' },
			{ scheduled_at: 'not-a-date', duration_minutes: 30, status: 'scheduled' },
		]);

		const from = Date.UTC(2026, 2, 6);
		const busy = await fetchBusyIntervals('u1', from, from + 86_400_000, 15);

		expect(busy).toHaveLength(2);
		// 15:00–15:30 padded ±15m
		expect(busy[0]).toEqual({
			start: Date.UTC(2026, 2, 6, 14, 45),
			end: Date.UTC(2026, 2, 6, 15, 45),
		});
		// null duration → 30m default, padded ±15m
		expect(busy[1]).toEqual({
			start: Date.UTC(2026, 2, 6, 17, 45),
			end: Date.UTC(2026, 2, 6, 18, 45),
		});
	});

	it('negative buffer is treated as zero', async () => {
		queueAppointments([
			{ scheduled_at: '2026-03-06T15:00:00Z', duration_minutes: 30, status: 'scheduled' },
		]);
		const busy = await fetchBusyIntervals('u1', 0, Date.UTC(2027, 0, 1), -60);
		expect(busy[0]).toEqual({
			start: Date.UTC(2026, 2, 6, 15, 0),
			end: Date.UTC(2026, 2, 6, 15, 30),
		});
	});
});

describe('computeSlots', () => {
	it('generates window slots in link-local time and enforces the 2h minimum notice', async () => {
		// Friday 2026-03-06, 07:15 EST. Earliest bookable = 09:15 EST → 09:00 excluded.
		vi.useFakeTimers({ now: new Date('2026-03-06T12:15:00Z') });
		queueAppointments();

		const out = await computeSlots(link(), 1);
		expect(out).toEqual([{ date: '2026-03-06', slots: ['09:30', '10:00', '10:30'] }]);
	});

	it('a slot starting exactly at now + MIN_NOTICE_MS is allowed (boundary)', async () => {
		expect(MIN_NOTICE_MS).toBe(2 * 60 * 60 * 1000);
		vi.useFakeTimers({ now: new Date('2026-03-06T12:00:00Z') }); // earliest = 14:00Z = 09:00 EST
		queueAppointments();

		const out = await computeSlots(link(), 1);
		expect(out[0].slots).toContain('09:00');
	});

	it('excludes slots overlapping an appointment padded by buffer_minutes', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T12:15:00Z') });
		// 10:30 EST appointment (15:30Z), 30 min. Buffer 15 → busy 10:15–11:15 EST.
		queueAppointments([
			{ scheduled_at: '2026-03-06T15:30:00Z', duration_minutes: 30, status: 'scheduled' },
		]);

		const out = await computeSlots(link({ buffer_minutes: 15 }), 1);
		expect(out).toEqual([{ date: '2026-03-06', slots: ['09:30'] }]);
	});

	it('with buffer 0 only the truly overlapping slot is blocked', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T12:15:00Z') });
		queueAppointments([
			{ scheduled_at: '2026-03-06T15:30:00Z', duration_minutes: 30, status: 'scheduled' },
		]);

		const out = await computeSlots(link({ buffer_minutes: 0 }), 1);
		// 10:00–10:30 EST ends exactly when the appointment starts → allowed.
		expect(out).toEqual([{ date: '2026-03-06', slots: ['09:30', '10:00'] }]);
	});

	it('cancelled appointments do not block slots', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T12:15:00Z') });
		queueAppointments([
			{ scheduled_at: '2026-03-06T15:30:00Z', duration_minutes: 30, status: 'cancelled' },
		]);
		const out = await computeSlots(link(), 1);
		expect(out[0].slots).toEqual(['09:30', '10:00', '10:30']);
	});

	it('slots must END inside the window (no slot spilling past close)', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T05:00:00Z') }); // midnight EST — notice irrelevant
		queueAppointments();

		const out = await computeSlots(link({ availability: { fri: [['09:00', '10:15']] } }), 1);
		// 10:00 start would end 10:30 > 10:15 close → excluded.
		expect(out).toEqual([{ date: '2026-03-06', slots: ['09:00', '09:30'] }]);
	});

	it('days without availability windows are omitted entirely', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T05:00:00Z') }); // Fri local
		queueAppointments();

		const out = await computeSlots(link({ availability: { sat: [['09:00', '10:00']] } }), 3);
		expect(out).toEqual([{ date: '2026-03-07', slots: ['09:00', '09:30'] }]);
	});

	it('ignores malformed windows and times without throwing', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T05:00:00Z') });
		queueAppointments();

		const out = await computeSlots(
			link({
				availability: {
					fri: [
						['9am', '17:00'], // unparseable start
						['10:00', '09:00'], // end before start
						['09:00'] as any, // too short
						['10:00', '11:00'], // the only valid one
					],
				},
			}),
			1,
		);
		expect(out).toEqual([{ date: '2026-03-06', slots: ['10:00', '10:30'] }]);
	});

	it('merges overlapping windows without duplicate slot times, sorted', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T05:00:00Z') });
		queueAppointments();

		const out = await computeSlots(
			link({ availability: { fri: [['09:00', '10:00'], ['09:30', '10:30']] } }),
			1,
		);
		expect(out).toEqual([{ date: '2026-03-06', slots: ['09:00', '09:30', '10:00'] }]);
	});

	it('DST spring-forward window: unique consecutive local dates, one 09:00 slot each side', async () => {
		// Now = Thu 2026-03-05 19:00 EST (2026-03-06T00:00Z). 5 UTC day-steps cover
		// local dates Mar 5–9 with the Mar 8 spring-forward in the middle.
		vi.useFakeTimers({ now: new Date('2026-03-06T00:00:00Z') });
		queueAppointments();

		const everyDay = { availability: Object.fromEntries(
			['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [['09:00', '09:30']]]),
		) as any };
		const out = await computeSlots(link(everyDay), 5);

		const dates = out.map((d) => d.date);
		expect(new Set(dates).size).toBe(dates.length); // no duplicate local dates
		// Mar 5's 09:00 EST is in the past → dropped; Mar 6–9 all present.
		expect(dates).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']);
		for (const day of out) expect(day.slots).toEqual(['09:00']);
	});

	it('queries appointments for the owner over a padded horizon', async () => {
		vi.useFakeTimers({ now: new Date('2026-03-06T12:15:00Z') });
		queueAppointments();
		await computeSlots(link(), 2);

		expect(sb.opArgs('appointments', 'eq')).toEqual(['owner_user_id', 'u1']);
		expect(sb.opArgs('appointments', 'gte')).toBeDefined();
		expect(sb.opArgs('appointments', 'lte')).toBeDefined();
	});
});
