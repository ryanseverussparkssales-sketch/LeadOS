/**
 * Admin audit log + per-account override helpers.
 * Every super-admin write-action should call logAdminAction so there's an
 * immutable trail of who did what to which tenant. Non-fatal: auditing must
 * never block the action itself.
 */
import { supabaseAdmin } from './supabase';

export type AdminAction =
	| 'tier_change'
	| 'suspend'
	| 'reactivate'
	| 'reset_password'
	| 'force_logout'
	| 'impersonate'
	| 'override_update'
	| 'offboard'
	| 'create_account';

export async function logAdminAction(args: {
	adminUserId: string;
	adminEmail?: string | null;
	action: AdminAction;
	targetUserId?: string | null;
	targetEmail?: string | null;
	detail?: Record<string, unknown>;
}): Promise<void> {
	try {
		await supabaseAdmin.from('admin_audit_log').insert({
			admin_user_id: args.adminUserId,
			admin_email: args.adminEmail ?? null,
			action: args.action,
			target_user_id: args.targetUserId ?? null,
			target_email: args.targetEmail ?? null,
			detail: args.detail ?? {},
		});
	} catch (e) {
		console.error('[audit] logAdminAction failed:', e instanceof Error ? e.message : e);
	}
}

export interface AccountOverride {
	user_id: string;
	suspended: boolean;
	suspended_reason: string | null;
	suspended_at: string | null;
	ai_access: 'on' | 'off' | null;
	trial_ends_at: string | null;
	rate_limit_multiplier: number | null;
	feature_flags: Record<string, unknown> | null;
	notes: string | null;
}

/** Fetch a single account's overrides (null if none set). */
export async function getOverride(userId: string): Promise<AccountOverride | null> {
	const { data } = await supabaseAdmin
		.from('account_overrides')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();
	return (data as AccountOverride) ?? null;
}

/**
 * Is this account (or, for a team member, their owner) suspended?
 * Fails OPEN (returns false) on any error so a lookup hiccup never locks the platform out.
 */
export async function isAccountSuspended(userId: string): Promise<boolean> {
	try {
		// Resolve the owner for team members so suspending an agency suspends its reps.
		const { data: member } = await supabaseAdmin
			.from('team_members')
			.select('owner_user_id')
			.eq('member_user_id', userId)
			.eq('status', 'active')
			.maybeSingle();
		const ownerId = member?.owner_user_id ?? userId;

		const { data } = await supabaseAdmin
			.from('account_overrides')
			.select('suspended')
			.eq('user_id', ownerId)
			.maybeSingle();
		return data?.suspended === true;
	} catch {
		return false;
	}
}
