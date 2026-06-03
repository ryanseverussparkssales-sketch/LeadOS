import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 2) return json({ contacts: [], calls: [], campaigns: [], scripts: [], deals: [] });

	const like = `%${q}%`;

	const [contacts, calls, campaigns, scripts, deals] = await Promise.all([
		// Contacts: name, company, phone, email — exclude soft-deleted
		supabaseAdmin.from('contacts')
			.select('id, name, company, phone, contact_type')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.or(`name.ilike.${like},company.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
			.limit(6),

		// Calls: summary, notes
		supabaseAdmin.from('calls')
			.select('id, created_at, summary, outcome, contact:contacts(name, company)')
			.eq('user_id', ownerId)
			.or(`summary.ilike.${like},notes.ilike.${like}`)
			.limit(4),

		// Campaigns: name — exclude soft-deleted
		supabaseAdmin.from('campaigns')
			.select('id, name, project:projects(name, client:clients(name))')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.ilike('name', like)
			.limit(4),

		// Scripts: title
		supabaseAdmin.from('scripts')
			.select('id, title')
			.eq('user_id', ownerId)
			.ilike('title', like)
			.limit(4),

		// Deals: title — exclude soft-deleted
		supabaseAdmin.from('deals')
			.select('id, title, stage, value, contact:contacts(name)')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.ilike('title', like)
			.limit(4),
	]);

	return json({
		contacts: contacts.data ?? [],
		calls: calls.data ?? [],
		campaigns: campaigns.data ?? [],
		scripts: scripts.data ?? [],
		deals: deals.data ?? [],
	});
};
