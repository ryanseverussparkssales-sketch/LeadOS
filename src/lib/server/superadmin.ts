/**
 * Platform super-admin identification.
 *
 * The master/operator account(s) are listed in the SUPER_ADMIN_USER_IDS env var
 * (comma-separated Supabase user UUIDs). Kept in env — not the database — so it
 * can't be self-granted by a customer and there's nothing to spoof. This module
 * deliberately imports nothing but env so it can be used from both the auth layer
 * (supabase.ts) and the tier layer (tier.ts) without circular dependencies.
 */
import { env } from '$env/dynamic/private';

export function superAdminIds(): string[] {
	return (env.SUPER_ADMIN_USER_IDS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function isSuperAdmin(userId: string | null | undefined): boolean {
	if (!userId) return false;
	return superAdminIds().includes(userId);
}
