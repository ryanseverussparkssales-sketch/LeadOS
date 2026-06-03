import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// POST: mark a batch of phone numbers as Do Not Call
// Body: { phones: string[] }  — raw phone numbers in any format
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { phones } = await request.json() as { phones: string[] };
	if (!phones?.length) throw error(400, 'phones array required');

	// Normalize all input numbers
	const normalized = phones
		.map(p => normalizePhone(p.trim()))
		.filter(Boolean) as string[];

	if (!normalized.length) return json({ updated: 0, notFound: 0 });

	// Look up contacts by normalized phone in batches of 500
	let updatedCount = 0;
	const BATCH = 500;

	for (let i = 0; i < normalized.length; i += BATCH) {
		const chunk = normalized.slice(i, i + BATCH);

		const { data: matches } = await supabaseAdmin
			.from('contacts')
			.select('id')
			.eq('user_id', ownerId)
			.in('phone_normalized', chunk)
			.is('deleted_at', null);

		const ids = (matches ?? []).map(c => c.id);
		if (ids.length > 0) {
			await supabaseAdmin
				.from('contacts')
				.update({ status: 'do_not_call' })
				.in('id', ids);
			updatedCount += ids.length;
		}
	}

	return json({
		updated: updatedCount,
		notFound: normalized.length - updatedCount,
	});
};
