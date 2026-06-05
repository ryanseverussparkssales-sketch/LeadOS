import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Service role bypasses RLS, so verify the parent script belongs to the caller's
// org before allowing any objection mutation (prevents cross-tenant IDOR).
async function assertScriptOwnership(userId: string, scriptId: string): Promise<void> {
	const ownerId = await getEffectiveUserId(userId);
	const { data } = await supabaseAdmin
		.from('scripts')
		.select('id')
		.eq('id', scriptId)
		.eq('user_id', ownerId)
		.maybeSingle();
	if (!data) throw error(404, 'Script not found');
}

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await assertScriptOwnership(user.id, params.id);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('script_objections')
		.update(body)
		.eq('id', params.oid)
		.eq('script_id', params.id)
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await assertScriptOwnership(user.id, params.id);
	await supabaseAdmin
		.from('script_objections')
		.delete()
		.eq('id', params.oid)
		.eq('script_id', params.id);
	return json({ success: true });
};
