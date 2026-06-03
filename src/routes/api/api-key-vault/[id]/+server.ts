import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { encryptValue, decryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data, error: e } = await supabaseAdmin
		.from('api_key_vault')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.single();

	if (e || !data) throw error(404, 'Not found');
	return json({ ...data, key_value: decryptValue(data.key_value) });
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const b = await request.json();

	const update: Record<string, unknown> = {};
	if (b.name !== undefined) update.name = b.name;
	if (b.service !== undefined) update.service = b.service;
	if (b.environment !== undefined) update.environment = b.environment;
	if (b.notes !== undefined) update.notes = b.notes;
	if (b.keyValue !== undefined) update.key_value = encryptValue(b.keyValue);

	const { data, error: e } = await supabaseAdmin
		.from('api_key_vault')
		.update(update)
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json({ ...data, key_value: b.keyValue ?? decryptValue(data.key_value) });
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await supabaseAdmin.from('api_key_vault').delete().eq('id', params.id).eq('user_id', ownerId);
	return json({ success: true });
};
