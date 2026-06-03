import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: list channels the current user participates in
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	// Get channels this user is a participant of
	const { data: participations } = await supabaseAdmin
		.from('channel_participants')
		.select('channel_id, last_read_at, channel:message_channels(id, name, channel_type, campaign_id, client_id, created_at)')
		.eq('user_id', user.id);

	if (!participations?.length) return json([]);

	const channelIds = participations.map(p => p.channel_id);

	// Get last message per channel
	const { data: lastMessages } = await supabaseAdmin
		.from('messages')
		.select('channel_id, content, sender_name, created_at')
		.in('channel_id', channelIds)
		.order('created_at', { ascending: false });

	// Get unread counts
	const channels = participations.map(p => {
		const ch = p.channel as any;
		const channelMsgs = (lastMessages ?? []).filter(m => m.channel_id === p.channel_id);
		const lastMsg = channelMsgs[0] ?? null;
		const unread = p.last_read_at
			? channelMsgs.filter(m => m.created_at > p.last_read_at!).length
			: channelMsgs.length;

		return {
			...ch,
			last_read_at: p.last_read_at,
			last_message: lastMsg,
			unread_count: unread,
		};
	});

	channels.sort((a, b) =>
		(b.last_message?.created_at ?? b.created_at) > (a.last_message?.created_at ?? a.created_at) ? 1 : -1
	);

	return json(channels);
};

// POST: create a new channel
// Body: { name, channelType, campaignId?, clientId?, participantUserIds[] }
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, channelType = 'general', campaignId, clientId, participantUserIds = [] } = await request.json();

	if (!name?.trim()) throw error(400, 'name required');

	const { data: channel, error: e } = await supabaseAdmin
		.from('message_channels')
		.insert({
			owner_user_id: ownerId,
			name: name.trim(),
			channel_type: channelType,
			campaign_id: campaignId ?? null,
			client_id: clientId ?? null,
		})
		.select().single();

	if (e) throw error(400, e.message);

	// Add creator as admin participant
	const participants = [
		{ channel_id: channel.id, user_id: user.id, participant_role: 'admin' },
		...participantUserIds.map((uid: string) => ({
			channel_id: channel.id,
			user_id: uid,
			participant_role: 'member',
		})),
	];

	await supabaseAdmin.from('channel_participants').insert(participants);

	return json(channel, { status: 201 });
};
