import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';

export const GET = async ({ request, url }: { request: Request; url: URL }) => {
	const user = await requireAuth(request);
	const sourceId = url.searchParams.get('source_id');

	let query = supabaseAdmin
		.from('lead_routing_rules')
		.select('*')
		.eq('user_id', user.id)
		.order('rule_order', { ascending: true });

	if (sourceId) query = query.eq('lead_source_id', sourceId);

	const { data, error } = await query;
	if (error) return json({ error: error.message }, { status: 500 });
	return json(data ?? []);
};

export const POST = async ({ request }: { request: Request }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const { data, error } = await supabaseAdmin
		.from('lead_routing_rules')
		.insert({
			user_id: user.id,
			lead_source_id: body.lead_source_id ?? null,
			rule_order: body.rule_order ?? 0,
			name: body.name ?? null,
			condition_field: body.condition_field,
			condition_operator: body.condition_operator ?? 'contains',
			condition_value: body.condition_value ?? null,
			action_type: body.action_type,
			action_value: body.action_value ?? null,
			stop_on_match: body.stop_on_match ?? false,
			is_active: true,
		})
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};
