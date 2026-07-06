import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';
import { createHash } from 'crypto';
import { isSuperAdmin } from './superadmin';

export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Personal API token auth (machine-to-machine: MCP clients, scripts, Zapier).
 * Tokens are minted in Settings → API Tokens (`ldo_` prefix, SHA-256 hash stored,
 * see api/settings/api-tokens). Returns a synthetic user pinned to the token's
 * owner, with `token_scopes` attached so callers can gate write access.
 */
async function authenticateApiToken(rawToken: string) {
	const tokenHash = createHash('sha256').update(rawToken).digest('hex');
	const { data: row } = await supabaseAdmin
		.from('api_tokens')
		.select('id, user_id, name, scopes, expires_at')
		.eq('token_hash', tokenHash)
		.maybeSingle();
	if (!row) throw error(401, 'Unauthorized');
	if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
		throw error(401, 'Token expired');
	}
	// Touch last_used_at (fire and forget — never block the request on it)
	supabaseAdmin.from('api_tokens')
		.update({ last_used_at: new Date().toISOString() })
		.eq('id', row.id)
		.then(() => {}, () => {});
	return {
		id: row.user_id,
		email: `api-token:${row.name}`,
		token_scopes: (row.scopes as string[] | null) ?? ['read'],
		is_api_token: true,
	} as { id: string; email: string; token_scopes: string[]; is_api_token: true };
}

// Validate the bearer token and return the REAL authenticated user (no impersonation).
async function authenticateRaw(request: Request) {
	const authHeader = request.headers.get('authorization');
	const token = authHeader?.replace('Bearer ', '');
	if (!token) throw error(401, 'Unauthorized');

	// Personal API tokens (ldo_…) — machine callers, checked against api_tokens.
	if (token.startsWith('ldo_')) return authenticateApiToken(token);

	const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
	if (authError || !data.user) throw error(401, 'Unauthorized');
	return data.user;
}

/**
 * Authenticate a request for normal data access.
 *
 * Impersonation: when the REAL authenticated user is a platform super-admin and the
 * request carries `X-Impersonate-Owner: <ownerId>`, the returned user's `id` is the
 * impersonated owner — so every route that does `getEffectiveUserId(user.id)` scopes
 * to that account automatically, with no per-route changes. The real id is preserved
 * on `real_id`. Non-admins can never impersonate (the header is ignored for them).
 */
export async function requireAuth(request: Request) {
	const realUser = await authenticateRaw(request);
	const impersonate = request.headers.get('x-impersonate-owner');
	// Only hit the DB admin check when an impersonation header is actually present.
	if (impersonate && impersonate !== realUser.id && await isPlatformAdmin(realUser.id)) {
		return { ...realUser, id: impersonate, real_id: realUser.id, impersonating: true };
	}
	return { ...realUser, real_id: realUser.id, impersonating: false };
}

/**
 * Platform-admin check: the env-defined master (isSuperAdmin) OR a user promoted via
 * the `platform_admins` table (created from the admin dashboard). The env master is the
 * un-removable root; DB admins are additional operators. Async because of the DB lookup.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
	if (isSuperAdmin(userId)) return true; // env master — fast path, no DB
	const { data } = await supabaseAdmin
		.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
	return !!data;
}

/**
 * Require the caller to be a platform admin (env master or DB-promoted). Always checks
 * the REAL token identity (ignores any impersonation header), so admin endpoints are
 * never reachable by impersonating an admin. Throws 403 otherwise.
 */
export async function requireSuperAdmin(request: Request) {
	const realUser = await authenticateRaw(request);
	if (!(await isPlatformAdmin(realUser.id))) throw error(403, 'Forbidden — super admin only');
	return realUser;
}

// Single source of truth lives in $lib/utils/phone (pure + unit-tested).
export { normalizePhone } from '$lib/utils/phone';

export function parseCSV(text: string): string[][] {
	return text.trim().split('\n').map(row =>
		row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
	);
}

/**
 * Resolves the effective user ID for data queries.
 * If the user is a team member, returns their owner's user_id so they see shared data.
 * If the user is an owner (or solo), returns their own user_id.
 */
export async function getEffectiveUserId(userId: string): Promise<string> {
	const { data } = await supabaseAdmin
		.from('team_members')
		.select('owner_user_id')
		.eq('member_user_id', userId)
		.eq('status', 'active')
		.maybeSingle();
	return data?.owner_user_id ?? userId;
}

/**
 * Gets the role of a user within any team context.
 * Returns 'owner' if solo/owner, 'manager' or 'agent' if team member.
 */
export async function getUserRole(userId: string): Promise<{ role: 'owner' | 'manager' | 'agent'; ownerId: string }> {
	const { data } = await supabaseAdmin
		.from('team_members')
		.select('owner_user_id, role')
		.eq('member_user_id', userId)
		.eq('status', 'active')
		.maybeSingle();
	if (data) return { role: data.role as 'manager' | 'agent', ownerId: data.owner_user_id };
	return { role: 'owner', ownerId: userId };
}

// Quality scoring helper
export async function saveCallQualityScore(callId: string, score: number, breakdown: string): Promise<void> {
	await supabaseAdmin.from('calls').update({ quality_score: score, quality_breakdown: breakdown }).eq('id', callId);
}
