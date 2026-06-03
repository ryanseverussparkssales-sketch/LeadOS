import { supabaseAdmin } from './supabase';

// Increment the current_value of relevant active quotas for a user
export async function incrementQuota(userId: string, type: 'calls' | 'revenue', amount: number = 1) {
	const now = new Date().toISOString().slice(0, 10);

	// Find all active quotas of this type for this user that are in-period
	const { data: quotas } = await supabaseAdmin
		.from('quotas')
		.select('id, period, current_value, target_value')
		.eq('user_id', userId)
		.eq('quota_type', type)
		.lte('period_start', now)
		.gte('period_end', now);

	if (!quotas?.length) return;

	for (const quota of quotas) {
		// TODO: Race condition — concurrent calls can overwrite each other's increments.
		// Fix: create a Supabase RPC `increment_quota(quota_id, amount)` that runs
		// `UPDATE quotas SET current_value = current_value + $amount WHERE id = $quota_id`
		// atomically. For current low-volume usage this is acceptable.
		await supabaseAdmin
			.from('quotas')
			.update({
				current_value: (quota.current_value ?? 0) + amount,
				updated_at: new Date().toISOString(),
			})
			.eq('id', quota.id);
	}
}
