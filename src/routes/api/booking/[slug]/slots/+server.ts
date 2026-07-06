import { json } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { getActiveLinkBySlug, computeSlots, clampDays } from '../../_lib/slots';
import type { RequestHandler } from './$types';

// PUBLIC endpoint — no auth. Tenancy: everything derives from the booking_links
// row looked up by slug; the client supplies nothing but the slug + horizon.
export const GET: RequestHandler = async ({ params, url, getClientAddress }) => {
	let clientIp = 'unknown';
	try { clientIp = getClientAddress(); } catch { /* not available in some adapters */ }
	const rl = rateLimit(`bk:slots:${clientIp}`, 30, 60_000);
	if (!rl.ok) {
		return json(
			{ error: 'Too many requests' },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds ?? 60) } },
		);
	}

	const link = await getActiveLinkBySlug(params.slug);
	if (!link) return json({ error: 'Booking link not found' }, { status: 404 });

	const days = clampDays(link, parseInt(url.searchParams.get('days') ?? '', 10));

	try {
		const daySlots = await computeSlots(link, days);
		return json({
			link: {
				title: link.title,
				description: link.description,
				duration_minutes: link.duration_minutes,
				timezone: link.timezone,
			},
			days: daySlots,
		});
	} catch (err) {
		console.error('[booking/slots] compute failed:', err);
		return json({ error: 'Could not compute availability' }, { status: 500 });
	}
};
