import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const HHMM_RE = /^\d{1,2}:\d{2}$/;
const WEEKDAYS = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

/** Validate { mon: [["09:00","17:00"]], ... }. Returns cleaned object or null. */
function cleanAvailability(input: unknown): Record<string, [string, string][]> | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const out: Record<string, [string, string][]> = {};
	for (const [day, windows] of Object.entries(input as Record<string, unknown>)) {
		if (!WEEKDAYS.has(day)) return null;
		if (!Array.isArray(windows)) return null;
		const cleaned: [string, string][] = [];
		for (const w of windows) {
			if (!Array.isArray(w) || w.length !== 2) return null;
			const [start, end] = w;
			if (typeof start !== 'string' || typeof end !== 'string') return null;
			if (!HHMM_RE.test(start.trim()) || !HHMM_RE.test(end.trim())) return null;
			cleaned.push([start.trim(), end.trim()]);
		}
		if (cleaned.length) out[day] = cleaned;
	}
	return out;
}

function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'meeting';
}

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 7);
}

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data, error: e } = await supabaseAdmin
		.from('booking_links')
		.select('*')
		.eq('user_id', ownerId)
		.order('created_at', { ascending: false });

	if (e) throw error(500, e.message);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const body = await request.json().catch(() => ({}));
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) throw error(400, 'title required');

	const durationMinutes = Number(body.duration_minutes ?? 30);
	if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
		throw error(400, 'duration_minutes must be an integer between 5 and 480');
	}

	const timezone = typeof body.timezone === 'string' && body.timezone.trim()
		? body.timezone.trim() : 'America/New_York';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
	} catch {
		throw error(400, 'Invalid timezone');
	}

	let availability: Record<string, [string, string][]> | undefined;
	if (body.availability !== undefined) {
		const cleaned = cleanAvailability(body.availability);
		if (!cleaned || Object.keys(cleaned).length === 0) {
			throw error(400, 'availability must map weekday keys (mon..sun) to [["HH:MM","HH:MM"]] windows');
		}
		availability = cleaned;
	}

	const bufferMinutes = Number(body.buffer_minutes ?? 15);
	const maxDaysAhead = Number(body.max_days_ahead ?? 14);
	if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 240) {
		throw error(400, 'buffer_minutes must be 0-240');
	}
	if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 1 || maxDaysAhead > 60) {
		throw error(400, 'max_days_ahead must be 1-60');
	}

	const base = slugify(title);
	// "links" is a reserved API segment; the suffix keeps us clear of it anyway.
	let created = null;
	let lastErr = '';
	for (let attempt = 0; attempt < 5; attempt++) {
		const slug = `${base}-${randomSuffix()}`;
		const { data, error: e } = await supabaseAdmin
			.from('booking_links')
			.insert({
				user_id: ownerId,
				slug,
				title,
				description: typeof body.description === 'string' ? body.description.trim() || null : null,
				duration_minutes: durationMinutes,
				timezone,
				...(availability ? { availability } : {}),
				campaign_id: body.campaign_id ?? null,
				client_id: body.client_id ?? null,
				buffer_minutes: bufferMinutes,
				max_days_ahead: maxDaysAhead,
				active: body.active === false ? false : true,
			})
			.select()
			.single();
		if (!e) { created = data; break; }
		lastErr = e.message;
		// 23505 = unique_violation on slug → retry with a new suffix
		if (e.code !== '23505') throw error(400, e.message);
	}

	if (!created) throw error(500, lastErr || 'Could not generate a unique slug');
	return json(created, { status: 201 });
};
