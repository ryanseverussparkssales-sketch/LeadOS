import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('client_id');
	let q = supabaseAdmin.from('client_knowledge').select('*, client:clients(name)').eq('user_id', user.id);
	if (clientId) q = q.eq('client_id', clientId);
	const { data } = await q.order('sort_order').order('created_at');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { clientId, title, content, knowledgeType } = await request.json();
	if (!clientId || !title || !content) throw error(400, 'clientId, title, content required');
	const { data, error: e } = await supabaseAdmin
		.from('client_knowledge')
		.insert({ user_id: user.id, client_id: clientId, title: title.trim(), content, knowledge_type: knowledgeType ?? 'general' })
		.select('*, client:clients(name)').single();
	if (e) throw error(400, e.message);
	return json(data);
};
