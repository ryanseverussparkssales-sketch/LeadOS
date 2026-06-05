import { supabaseAdmin } from './supabase';
import { createHmac } from 'crypto';

export async function deliverWebhooks(
	userId: string,
	eventType: string,
	payload: Record<string, unknown>
): Promise<void> {
	const { data: hooks } = await supabaseAdmin
		.from('outbound_webhooks')
		.select('*')
		.eq('user_id', userId)
		.eq('enabled', true)
		.contains('events', [eventType]);

	for (const hook of hooks ?? []) {
		const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data: payload });
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Edelhaus-Event': eventType,
		};
		if (hook.secret) {
			const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
			headers['X-Edelhaus-Signature'] = `sha256=${sig}`;
		}
		try {
			await fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
			await supabaseAdmin.from('outbound_webhooks').update({ delivery_count: (hook.delivery_count ?? 0) + 1, last_delivered_at: new Date().toISOString() }).eq('id', hook.id);
		} catch (err) { console.error('[webhook delivery error]', hook.url, err); }
	}
}
