import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('user_preferences')
		.select('*')
		.eq('user_id', user.id)
		.maybeSingle();
	return json(data ?? {});
};

export const PUT: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const allowed = [
		'sidebar_items', 'theme', 'notification_sounds',
		'microphone_device_id', 'speaker_device_id',
		'contact_default_type', 'contact_required_fields',
		'dashboard_layout',
	];

	const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
	for (const key of allowed) {
		// Convert camelCase body keys to snake_case
		const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
		if (body[key] !== undefined) update[key] = body[key];
		if (body[snakeKey] !== undefined) update[key] = body[snakeKey];
		// Also handle dashboardLayout -> dashboard_layout
		const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
		if (body[camel] !== undefined) update[key] = body[camel];
	}

	const { data, error } = await supabaseAdmin
		.from('user_preferences')
		.upsert({ ...update, user_id: user.id }, { onConflict: 'user_id' })
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 400 });
	return json(data);
};
