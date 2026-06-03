import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

async function calculateScore(contactId: string, userId: string): Promise<number> {
	let score = 0;

	const [contact, recentCalls, openDeals] = await Promise.all([
		supabaseAdmin.from('contacts').select('contact_type, status, last_called_at, call_count').eq('id', contactId).eq('user_id', userId).single(),
		supabaseAdmin.from('calls').select('outcome, created_at').eq('contact_id', contactId).eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
		supabaseAdmin.from('deals').select('stage').eq('contact_id', contactId).eq('user_id', userId).not('stage', 'in', '("won","lost")'),
	]);

	const c = contact.data;
	if (!c) return 0;

	// Type score
	if (c.contact_type === 'customer') score += 40;
	else if (c.contact_type === 'prospect') score += 20;
	else if (c.contact_type === 'lead') score += 10;

	// Status
	if (c.status === 'active') score += 10;
	if (c.status === 'do_not_call') return 0;

	// Recent call activity
	if (c.last_called_at) {
		const daysSince = (Date.now() - new Date(c.last_called_at).getTime()) / 86400000;
		if (daysSince < 7) score += 20;
		else if (daysSince < 30) score += 10;
		else if (daysSince > 90) score -= 10;
	}

	// Call outcomes
	const calls = recentCalls.data ?? [];
	for (const call of calls) {
		if (call.outcome === 'callback') score += 30;
		else if (call.outcome === 'answered') score += 10;
		else if (call.outcome === 'not_interested') score -= 20;
	}

	// Open deals
	if ((openDeals.data ?? []).length > 0) score += 25;

	return Math.min(100, Math.max(0, score));
}

// POST: score a specific contact
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { contactId } = await request.json();
	if (!contactId) return json({ error: 'contactId required' }, { status: 400 });

	const score = await calculateScore(contactId, ownerId);
	await supabaseAdmin.from('contacts').update({ contact_score: score, score_updated_at: new Date().toISOString() }).eq('id', contactId).eq('user_id', ownerId);
	return json({ score });
};

// GET: bulk score all contacts for user (or all users if called by cron)
export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const isCron = env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`;

	let updated = 0;

	if (isCron) {
		// Cron path: score active contacts across ALL users (up to 500 per run)
		const { data: contacts } = await supabaseAdmin
			.from('contacts')
			.select('id, user_id')
			.eq('status', 'active')
			.is('deleted_at', null)
			.limit(500);
	return json({ success: true });
};
