/**
 * Slot computation for public booking links.
 *
 * All times are computed in the LINK's timezone using Intl APIs only (no deps).
 * Availability shape: { mon: [["09:00","17:00"], ...], tue: [...], ... }
 * A slot is bookable when:
 *   - it starts inside an availability window and ends before the window closes
 *   - it does not overlap any existing appointment for the owner
 *     (padded by buffer_minutes on both sides)
 *   - it starts at least MIN_NOTICE_MS from now
 */

import { supabaseAdmin } from '$lib/server/supabase';

export const MIN_NOTICE_MS = 2 * 60 * 60 * 1000; // minimum 2h notice

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type Availability = Partial<Record<WeekdayKey, [string, string][]>>;

export interface BookingLinkRow {
	id: string;
	user_id: string;
	slug: string;
	title: string;
	description: string | null;
	duration_minutes: number;
	timezone: string;
	availability: Availability;
	campaign_id: string | null;
	client_id: string | null;
	buffer_minutes: number | null;
	max_days_ahead: number | null;
	active: boolean;
}

/** Offset (ms) of `tz` from UTC at the given UTC instant. */
function tzOffsetMs(tz: string, utcDate: Date): number {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit',
		hour12: false,
	});
	const map: Record<string, string> = {};
	for (const p of dtf.formatToParts(utcDate)) map[p.type] = p.value;
	const asUtc = Date.UTC(
		Number(map.year), Number(map.month) - 1, Number(map.day),
		map.hour === '24' ? 0 : Number(map.hour), Number(map.minute), Number(map.second),
	);
	return asUtc - utcDate.getTime();
}

/** Convert a wall-clock date+time in `tz` ("YYYY-MM-DD", "HH:MM") to a UTC Date. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
	const [y, m, d] = dateStr.split('-').map(Number);
	const [hh, mm] = timeStr.split(':').map(Number);
	const naive = Date.UTC(y, m - 1, d, hh, mm);
	// Two-pass offset resolution handles DST transitions well enough for slots.
	let offset = tzOffsetMs(tz, new Date(naive));
	offset = tzOffsetMs(tz, new Date(naive - offset));
	return new Date(naive - offset);
}

/** "YYYY-MM-DD" + weekday key for a UTC instant, rendered in `tz`. */
function dateInfoInTz(utc: Date, tz: string): { date: string; weekday: WeekdayKey } {
	const dateStr = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
	}).format(utc);
	const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
		.format(utc).toLowerCase().slice(0, 3) as WeekdayKey;
	return { date: dateStr, weekday: wd };
}

function parseHHMM(t: unknown): number | null {
	if (typeof t !== 'string') return null;
	const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
	if (!m) return null;
	const h = Number(m[1]), min = Number(m[2]);
	if (h < 0 || h > 23 || min < 0 || min > 59) return null;
	return h * 60 + min;
}

const pad = (n: number) => String(n).padStart(2, '0');
const minutesToHHMM = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

interface BusyInterval { start: number; end: number } // epoch ms, buffer included

/** Existing appointments for the owner in [fromMs, toMs], padded by buffer. */
export async function fetchBusyIntervals(
	ownerUserId: string,
	fromMs: number,
	toMs: number,
	bufferMinutes: number,
): Promise<BusyInterval[]> {
	const bufMs = Math.max(0, bufferMinutes) * 60_000;
	// Widen the query so an appointment starting just before the window still blocks
	// slots inside it (longest realistic appointment + buffer ≈ 4h padding).
	const padMs = 4 * 60 * 60 * 1000 + bufMs;
	const { data } = await supabaseAdmin
		.from('appointments')
		.select('scheduled_at, duration_minutes, status')
		.eq('owner_user_id', ownerUserId)
		.gte('scheduled_at', new Date(fromMs - padMs).toISOString())
		.lte('scheduled_at', new Date(toMs + padMs).toISOString());

	const busy: BusyInterval[] = [];
	for (const a of data ?? []) {
		if (!a.scheduled_at) continue;
		if (a.status === 'cancelled' || a.status === 'canceled' || a.status === 'no_show') continue;
		const start = new Date(a.scheduled_at).getTime();
		if (Number.isNaN(start)) continue;
		const end = start + (a.duration_minutes ?? 30) * 60_000;
		busy.push({ start: start - bufMs, end: end + bufMs });
	}
	return busy;
}

const overlaps = (busy: BusyInterval[], start: number, end: number) =>
	busy.some((b) => start < b.end && end > b.start);

export interface DaySlots { date: string; slots: string[] }

/**
 * Compute bookable slots for the next `days` days (capped by the caller at the
 * link's max_days_ahead). Returns local "HH:MM" slot starts grouped by local date.
 */
export async function computeSlots(link: BookingLinkRow, days: number): Promise<DaySlots[]> {
	const now = Date.now();
	const durMs = Math.max(5, link.duration_minutes) * 60_000;
	const stepMin = Math.max(5, link.duration_minutes);
	const busy = await fetchBusyIntervals(
		link.user_id, now, now + days * 86_400_000 + 86_400_000, link.buffer_minutes ?? 15,
	);
	const earliest = now + MIN_NOTICE_MS;

	const out: DaySlots[] = [];
	const seenDates = new Set<string>();
	for (let i = 0; i < days; i++) {
		const { date, weekday } = dateInfoInTz(new Date(now + i * 86_400_000), link.timezone);
		if (seenDates.has(date)) continue; // DST edge: same local date twice
		seenDates.add(date);

		const windows = link.availability?.[weekday];
		if (!Array.isArray(windows) || windows.length === 0) continue;

		const slots: string[] = [];
		for (const w of windows) {
			if (!Array.isArray(w) || w.length < 2) continue;
			const startMin = parseHHMM(w[0]);
			const endMin = parseHHMM(w[1]);
			if (startMin === null || endMin === null || endMin <= startMin) continue;

			for (let t = startMin; t + stepMin <= endMin; t += stepMin) {
				const hhmm = minutesToHHMM(t);
				const slotStart = zonedToUtc(date, hhmm, link.timezone).getTime();
				const slotEnd = slotStart + durMs;
				if (slotStart < earliest) continue;
				if (overlaps(busy, slotStart, slotEnd)) continue;
				slots.push(hhmm);
			}
		}
		if (slots.length) out.push({ date, slots: [...new Set(slots)].sort() });
	}
	return out;
}

/** Fetch an ACTIVE booking link by slug (public lookup). Returns null if absent. */
export async function getActiveLinkBySlug(slug: string): Promise<BookingLinkRow | null> {
	if (!slug || slug.length > 200) return null;
	const { data } = await supabaseAdmin
		.from('booking_links')
		.select('*')
		.eq('slug', slug)
		.eq('active', true)
		.maybeSingle();
	return (data as BookingLinkRow | null) ?? null;
}

/** Clamp requested horizon to the link's max_days_ahead (default 14, hard cap 60). */
export function clampDays(link: BookingLinkRow, requested: number): number {
	const max = Math.min(Math.max(1, link.max_days_ahead ?? 14), 60);
	if (!Number.isFinite(requested) || requested <= 0) return max;
	return Math.min(Math.floor(requested), max);
}
