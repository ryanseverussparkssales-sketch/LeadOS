import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	try {
		// contacts, clients, and deals have user_id directly.
		// projects and campaigns own through clients (client.user_id).
		const [contacts, clients, deals, projectsRaw, campaignsRaw] = await Promise.all([
			supabaseAdmin
				.from('contacts')
				.select('id, name, phone, company, deleted_at')
				.eq('user_id', ownerId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false })
				.limit(100),
			supabaseAdmin
				.from('clients')
				.select('id, name, deleted_at')
				.eq('user_id', ownerId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false })
				.limit(50),
			supabaseAdmin
				.from('deals')
				.select('id, name, deleted_at')
				.eq('user_id', ownerId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false })
				.limit(50),
			// Projects: join through clients to verify ownership
			supabaseAdmin
				.from('projects')
				.select('id, name, deleted_at, client_id, client:clients!inner(user_id)')
				.eq('client.user_id', ownerId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false })
				.limit(50),
			// Campaigns: join through projects -> clients to verify ownership
			supabaseAdmin
				.from('campaigns')
				.select('id, name, deleted_at, project_id, project:projects!inner(client:clients!inner(user_id))')
				.eq('project.client.user_id', ownerId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false })
				.limit(50),
		]);

		// Strip the join fields from projects/campaigns before returning (avoid leaking nested user_id)
		const projects = (projectsRaw.data ?? []).map(({ client: _c, ...rest }: any) => rest);
		const campaigns = (campaignsRaw.data ?? []).map(({ project: _p, ...rest }: any) => rest);

		return json({
			contacts: contacts.data ?? [],
			clients: clients.data ?? [],
			deals: deals.data ?? [],
			projects,
			campaigns,
		});
	} catch (err) {
		console.error('[trash] Query failed:', err);
		return json({ contacts: [], clients: [], campaigns: [], projects: [], deals: [] });
	}
};
