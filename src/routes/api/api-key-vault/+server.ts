import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { encryptValue, decryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data } = await supabaseAdmin
		.from('api_key_vault')
		.select('id, name, service, key_value, environment, notes, created_at')
		.eq('user_id', ownerId)
		.order('name');

	// Decrypt on the way out
	const decrypted = (data ?? []).map(row => ({
		...row,
		key_value: row.key_value ? decryptValue(row.key_value) : '',
	}));

	return json(decrypted);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, service, keyValue, environment, notes } = await request.json();
	if (!name?.trim() || !keyValue?.trim()) throw error(400, 'name and keyValue required');

	// Encrypt before storing
	const encrypted = encryptValue(keyValue);

	const { data, error: e } = await supabaseAdmin
		.from('api_key_vault')
		.insert({
			user_id: user.id,
			name: name.trim(),
			service: service || null,
			key_value: encrypted,
			environment: environment || 'production',
			notes: notes || null,
		})
		.select()
		.single();

	if (e) throw error(400, e.message);
	return json({ ...data, key_value: keyValue });
};
