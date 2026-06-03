import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	// Verify this call belongs to the owner
	const { data: call } = await supabaseAdmin
		.from('calls').select('id, user_id').eq('id', params.id).maybeSingle();
	if (!call || call.user_id !== ownerId) throw error(404, 'Call not found');

	const { data } = await supabaseAdmin
		.from('call_feedback')
		.select('*')
		.eq('call_id', params.id)
		.order('created_at', { ascending: true });

	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { content, timestamp_seconds, rating } = await request.json();
	if (!content?.trim()) throw error(400, 'content required');

	// Verify ownership
	const { data: call } = await supabaseAdmin
		.from('calls').select('id, user_id').eq('id', params.id).maybeSingle();
	if (!call || call.user_id !== ownerId) throw error(404, 'Call not found');

	const { data, error: e } = await supabaseAdmin
		.from('call_feedback')
		.insert({
			call_id: params.id,
			reviewer_user_id: user.id,
			content: content.trim(),
			timestamp_seconds: timestamp_seconds ?? null,
			rating: rating ?? null,
		})
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const user = await requireAuth(request);
	const feedbackId = url.searchParams.get('feedback_id');
	if (!feedbackId) throw error(400, 'feedback_id required');

	await supabaseAdmin
		.from('call_feedback')
		.delete()
		.eq('id', feedbackId)
		.eq('reviewer_user_id', user.id);

	return json({ success: true });
};
