import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';

export const PATCH = async ({ request, params }: { request: Request; params: { id: string } }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	// Prevent user_id override
	const { user_id: _stripped, ...safeBody } = body;

	const { data, error } = await supabaseAdmin
		.from('lead_routing_rules')
		.update(safeBody)
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};

export const DELETE = async ({ request, params }: { request: Request; params: { id: string } }) => {
	const user = await requireAuth(request);
	await supabaseAdmin
		.from('lead_routing_rules')
		.delete()
		.eq('id', params.id)
		.eq('user_id', user.id);
	return json({ success: true });
};
