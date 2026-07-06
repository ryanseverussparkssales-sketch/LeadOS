import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { BRAND } from '$lib/brand';
import type { RequestHandler } from './$types';

// POST — send a message to Microsoft Teams via Incoming Webhook
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { title, text, color, facts } = await request.json();

	const { data: cfg } = await supabaseAdmin
		.from('teams_integrations').select('webhook_url').eq('user_id', user.id).maybeSingle();

	if (!cfg?.webhook_url) throw error(400, 'Teams webhook not configured — add it in Settings > Connections');

	// Teams Adaptive Card / MessageCard format
	const payload = {
		'@type': 'MessageCard',
		'@context': 'http://schema.org/extensions',
		themeColor: color ?? '0078D4',
		summary: title ?? `${BRAND} Notification`,
		sections: [{
			activityTitle: title ?? BRAND,
			activityText: text,
			facts: facts ?? [],
		}],
	};

	const resp = await fetch(cfg.webhook_url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});

	if (!resp.ok) throw error(502, `Teams webhook error: ${resp.status}`);
	return json({ ok: true });
};

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('teams_integrations')
		.select('id, channel_name, notify_new_leads, notify_calls, notify_deals, connected_at')
		.eq('user_id', user.id).maybeSingle();
	return json(data ?? { configured: false });
};

export const PUT: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('teams_integrations')
		.upsert({ user_id: user.id, webhook_url: b.webhookUrl, channel_name: b.channelName ?? null,
			notify_new_leads: b.notifyNewLeads ?? true, notify_calls: b.notifyCalls ?? false,
			notify_deals: b.notifyDeals ?? false }, { onConflict: 'user_id' })
		.select().single();
	if (e) throw error(500, e.message);
	return json(data);
};
