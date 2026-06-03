import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { createHash, randomBytes } from 'crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('api_tokens').select('id, name, scopes, created_at, last_used_at, expires_at')
		.eq('user_id', user.id).order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, scopes, expiresInDays } = await request.json();
	if (!name?.trim()) throw error(400, 'name required');

	// Generate token (shown once, then only hash stored)
	const rawToken = `ldo_${randomBytes(32).toString('hex')}`;
	const tokenHash = createHash('sha256').update(rawToken).digest('hex');

	const expiresAt = expiresInDays
		? new Date(Date.now() + expiresInDays * 86400000).toISOString()
		: null;

	const { data, error: e } = await supabaseAdmin
		.from('api_tokens')
		.insert({
			user_id: user.id,
			name: name.trim(),
			token_hash: tokenHash,
			scopes: scopes ?? ['read'],
			expires_at: expiresAt,
		})
		.select('id, name, scopes, created_at, expires_at')
		.single();

	if (e) throw error(400, e.message);
	// Return the raw token only this one time
	return json({ ...data, token: rawToken });
};
