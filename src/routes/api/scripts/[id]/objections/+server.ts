import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { objection, response, followUp } = await request.json();
	const { data: script } = await supabaseAdmin.from('scripts').select('id').eq('id', params.id).eq('user_id', user.id).single();
	if (!script) throw error(403, 'Forbidden');
	const { data, error: e } = await supabaseAdmin.from('script_objections').insert({ script_id: params.id, objection, response, follow_up: followUp ?? null }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
