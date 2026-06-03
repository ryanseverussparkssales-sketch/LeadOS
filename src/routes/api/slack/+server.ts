import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// POST — send a message to Slack via stored webhook URL or bot token
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { text, channel, username, iconEmoji } = await request.json();

	if (!text) throw error(400, 'text required');

	// Get the user's Slack integration config
	const { data: slackConfig } = await supabaseAdmin
		.from('slack_integrations')
		.select('webhook_url, default_channel')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!slackConfig?.webhook_url) throw error(400, 'Slack webhook not configured — add it in Settings > Connections');

	const payload = {
		text,
		channel: channel ?? slackConfig.default_channel ?? '#general',
		username: username ?? 'LeadOS',
		icon_emoji: iconEmoji ?? ':telephone_receiver:',
	};

	const resp = await fetch(slackConfig.webhook_url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});

	if (!resp.ok) {
		const txt = await resp.text();
		throw error(502, `Slack error: ${txt}`);
	}

	return json({ ok: true });
};

// GET — get integration config (without sensitive data)
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('slack_integrations')
		.select('id, workspace_name, default_channel, notify_new_leads, notify_calls, notify_deals, notify_tasks, connected_at')
		.eq('user_id', user.id)
		.maybeSingle();
	return json(data ?? { configured: false });
};

// PUT — save/update Slack config
export const PUT: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();

	const { data, error: e } = await supabaseAdmin
		.from('slack_integrations')
		.upsert({
			user_id: user.id,
			workspace_name: b.workspaceName ?? null,
			webhook_url: b.webhookUrl,
			default_channel: b.defaultChannel ?? '#general',
			notify_new_leads: b.notifyNewLeads ?? true,
			notify_calls: b.notifyCalls ?? false,
			notify_deals: b.notifyDeals ?? false,
			notify_tasks: b.notifyTasks ?? false,
		}, { onConflict: 'user_id' })
		.select().single();

	if (e) throw error(500, e.message);
	return json(data);
};
