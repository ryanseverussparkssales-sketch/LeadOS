import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';

export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

export async function requireAuth(request: Request) {
	const authHeader = request.headers.get('authorization');
	const token = authHeader?.replace('Bearer ', '');
	if (!token) throw error(401, 'Unauthorized');

	const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
	if (authError || !data.user) throw error(401, 'Unauthorized');
	return data.user;
}

export function normalizePhone(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	return `+${digits}`;
}

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
