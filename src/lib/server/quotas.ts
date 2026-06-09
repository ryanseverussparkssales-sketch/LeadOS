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
		// Atomic increment via the increment_quota RPC (supabase-quota-rpc.sql).
		// Avoids the read-modify-write race where concurrent calls overwrote each
		// other's increments. Falls back to the JS add only if the RPC is missing
		// (e.g. migration not yet applied), so quota tracking degrades gracefully.
		const { error: rpcErr } = await supabaseAdmin.rpc('increment_quota', {
			p_quota_id: quota.id,
			p_amount: amount,
		});
		if (rpcErr) {
			console.error('[quotas] increment_quota RPC failed, falling back:', rpcErr.message);
			await supabaseAdmin
				.from('quotas')
				.update({
					current_value: (quota.current_value ?? 0) + amount,
					updated_at: new Date().toISOString(),
				})
				.eq('id', quota.id);
		}
	}
}
