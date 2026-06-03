import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: fetch messages + mark as read
export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	// Verify participant
	const { data: participation } = await supabaseAdmin
		.from('channel_participants')
		.select('id')
		.eq('channel_id', params.channelId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (!participation) throw error(403, 'Not a participant');

	const { data: messages } = await supabaseAdmin
		.from('messages')
		.select('id, sender_id, sender_role, sender_name, content, created_at')
		.eq('channel_id', params.channelId)
		.order('created_at', { ascending: true })
		.limit(100);

	// Mark as read
	await supabaseAdmin
		.from('channel_participants')
		.update({ last_read_at: new Date().toISOString() })
		.eq('channel_id', params.channelId)
		.eq('user_id', user.id);

	return json(messages ?? []);
};

// POST: send a message
export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { content, senderRole, senderName } = await request.json();

	if (!content?.trim()) throw error(400, 'content required');

	// Verify participant
	const { data: participation } = await supabaseAdmin
		.from('channel_participants')
		.select('id')
		.eq('channel_id', params.channelId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (!participation) throw error(403, 'Not a participant');

	const { data: message, error: e } = await supabaseAdmin
		.from('messages')
		.insert({
			channel_id: params.channelId,
			sender_id: user.id,
			sender_role: senderRole ?? 'admin',
			sender_name: senderName ?? null,
			content: content.trim(),
		})
		.select().single();

	if (e) throw error(400, e.message);

	// Update last_read for sender
	await supabaseAdmin
		.from('channel_participants')
		.update({ last_read_at: new Date().toISOString() })
		.eq('channel_id', params.channelId)
		.eq('user_id', user.id);

	return json(message, { status: 201 });
};
