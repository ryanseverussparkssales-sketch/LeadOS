import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { encryptValue, decryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data, error: e } = await supabaseAdmin
		.from('password_vault')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.single();

	if (e || !data) throw error(404, 'Not found');
	return json({ ...data, password_encrypted: decryptValue(data.password_encrypted) });
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const b = await request.json();

	const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (b.siteName !== undefined) update.site_name = b.siteName;
	if (b.siteUrl !== undefined) update.site_url = b.siteUrl;
	if (b.username !== undefined) update.username = b.username;
	if (b.notes !== undefined) update.notes = b.notes;
	if (b.category !== undefined) update.category = b.category;
	if (b.passwordEncrypted !== undefined) {
		// Re-encrypt the new password
		update.password_encrypted = encryptValue(b.passwordEncrypted);
	}

	const { data, error: e } = await supabaseAdmin
		.from('password_vault')
		.update(update)
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json({ ...data, password_encrypted: b.passwordEncrypted ?? decryptValue(data.password_encrypted) });
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await supabaseAdmin.from('password_vault').delete().eq('id', params.id).eq('user_id', ownerId);
	return json({ success: true });
};
