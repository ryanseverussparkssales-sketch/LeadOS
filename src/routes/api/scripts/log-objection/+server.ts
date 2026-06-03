import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { callId, scriptId, objectionId } = await request.json();
	if (!callId || !scriptId || !objectionId) return json({ ok: false });

	// Verify call belongs to user
	const { data: call } = await supabaseAdmin.from('calls').select('id').eq('id', callId).eq('user_id', user.id).maybeSingle();
	if (!call) return json({ ok: false });

	await supabaseAdmin.from('script_objection_logs').insert({ call_id: callId, script_id: scriptId, objection_id: objectionId });
	return json({ ok: true });
};
