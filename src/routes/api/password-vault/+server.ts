import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { encryptValue, decryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data } = await supabaseAdmin
		.from('password_vault')
		.select('id, site_name, site_url, username, password_encrypted, notes, category, created_at')
		.eq('user_id', ownerId)
		.order('site_name');

	// Decrypt on the way out — handles both legacy plaintext and new encrypted format
	const decrypted = (data ?? []).map(row => ({
		...row,
		password_encrypted: row.password_encrypted ? decryptValue(row.password_encrypted) : '',
	}));

	return json(decrypted);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { siteName, siteUrl, username, passwordEncrypted, notes, category } = await request.json();
	if (!siteName?.trim() || !passwordEncrypted?.trim()) throw error(400, 'siteName and password required');

	// Encrypt before storing
	const encrypted = encryptValue(passwordEncrypted);

	const { data, error: e } = await supabaseAdmin
		.from('password_vault')
		.insert({
			user_id: user.id,
			site_name: siteName.trim(),
			site_url: siteUrl || null,
			username: username || null,
			password_encrypted: encrypted,
			notes: notes || null,
			category: category || 'general',
		})
		.select()
		.single();

	if (e) throw error(400, e.message);

	// Return decrypted so UI gets the original value back
	return json({ ...data, password_encrypted: passwordEncrypted });
};
