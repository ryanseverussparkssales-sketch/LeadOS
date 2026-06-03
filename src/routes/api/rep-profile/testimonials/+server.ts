import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: fetch testimonials (own = all, public = approved only)
export const GET: RequestHandler = async ({ request, url }) => {
	const userId = url.searchParams.get('user_id');
	const ownRequest = !userId; // no user_id = fetching own

	if (ownRequest) {
		const user = await requireAuth(request);
		const { data } = await supabaseAdmin
			.from('rep_testimonials')
			.select('*')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });
		return json(data ?? []);
	}

	// Public: approved only
	const { data } = await supabaseAdmin
		.from('rep_testimonials')
		.select('id, client_name, client_company, client_title, content, rating, created_at')
		.eq('user_id', userId)
		.eq('approved', true)
		.order('created_at', { ascending: false });
	return json(data ?? []);
};

// POST: submit a testimonial request (admin submits on behalf of client)
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { clientName, clientCompany, clientTitle, content, rating, approved } = await request.json();

	if (!clientName || !content) throw error(400, 'clientName and content required');

	const { data, error: e } = await supabaseAdmin
		.from('rep_testimonials')
		.insert({
			user_id: user.id,
			client_name: clientName,
			client_company: clientCompany ?? null,
			client_title: clientTitle ?? null,
			content: content.trim(),
			rating: Math.min(5, Math.max(1, rating ?? 5)),
			approved: approved ?? false,
		})
		.select().single();

	if (e) throw error(400, e.message);
	return json(data, { status: 201 });
};

// PATCH: approve/feature a testimonial
export const PATCH: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	const body = await request.json();
	const { approved } = body;

	await supabaseAdmin.from('rep_testimonials')
		.update({ approved })
		.eq('id', id).eq('user_id', user.id);

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');
	await supabaseAdmin.from('rep_testimonials').delete().eq('id', id).eq('user_id', user.id);
	return json({ ok: true });
};
