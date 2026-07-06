import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const HHMM_RE = /^\d{1,2}:\d{2}$/;
const WEEKDAYS = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

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

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { id } = params;

	const body = await request.json().catch(() => ({}));
	const update: Record<string, unknown> = {};

	if ('title' in body) {
		const title = typeof body.title === 'string' ? body.title.trim() : '';
		if (!title) throw error(400, 'title cannot be empty');
		update.title = title;
	}
	if ('description' in body) {
		update.description = typeof body.description === 'string' ? body.description.trim() || null : null;
	}
	if ('duration_minutes' in body) {
		const d = Number(body.duration_minutes);
		if (!Number.isInteger(d) || d < 5 || d > 480) throw error(400, 'duration_minutes must be 5-480');
		update.duration_minutes = d;
	}
	if ('timezone' in body) {
		const tz = typeof body.timezone === 'string' ? body.timezone.trim() : '';
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: tz });
		} catch {
			throw error(400, 'Invalid timezone');
		}
		update.timezone = tz;
	}
	if ('availability' in body) {
		const cleaned = cleanAvailability(body.availability);
		if (!cleaned || Object.keys(cleaned).length === 0) {
			throw error(400, 'availability must map weekday keys (mon..sun) to [["HH:MM","HH:MM"]] windows');
		}
		update.availability = cleaned;
	}
	if ('buffer_minutes' in body) {
		const b = Number(body.buffer_minutes);
		if (!Number.isInteger(b) || b < 0 || b > 240) throw error(400, 'buffer_minutes must be 0-240');
		update.buffer_minutes = b;
	}
	if ('max_days_ahead' in body) {
		const m = Number(body.max_days_ahead);
		if (!Number.isInteger(m) || m < 1 || m > 60) throw error(400, 'max_days_ahead must be 1-60');
		update.max_days_ahead = m;
	}
	if ('campaign_id' in body) update.campaign_id = body.campaign_id ?? null;
	if ('client_id' in body) update.client_id = body.client_id ?? null;
	if ('active' in body) update.active = body.active === true;

	if (Object.keys(update).length === 0) throw error(400, 'No editable fields provided');

	// NOTE: slug is intentionally immutable — shared URLs must not break.
	const { data, error: e } = await supabaseAdmin
		.from('booking_links')
		.update(update)
		.eq('id', id)
		.eq('user_id', ownerId)
		.select()
		.maybeSingle();

	if (e) throw error(400, e.message);
	if (!data) throw error(404, 'Booking link not found');
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { id } = params;

	const { data, error: e } = await supabaseAdmin
		.from('booking_links')
		.delete()
		.eq('id', id)
		.eq('user_id', ownerId)
		.select('id')
		.maybeSingle();

	if (e) throw error(400, e.message);
	if (!data) throw error(404, 'Booking link not found');
	return json({ ok: true });
};
