import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const clientId   = url.searchParams.get('client_id');
	const campaignId = url.searchParams.get('campaign_id');

	let q = supabaseAdmin
		.from('scripts')
		.select('*, client:clients(id, name), campaign:campaigns(id, name), objections:script_objections(*)')
		.eq('user_id', ownerId)
		.order('is_default', { ascending: false })
		.order('created_at');

	// Return global + client-specific scripts
	if (clientId) q = q.or(`client_id.is.null,client_id.eq.${clientId}`);
	if (campaignId) q = q.or(`campaign_id.is.null,campaign_id.eq.${campaignId}`);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { title, opener, elevatorPitch, discovery, closing, clientId, campaignId, isDefault, objections } = await request.json();
	if (!title?.trim()) throw error(400, 'title required');

	if (isDefault) {
		await supabaseAdmin.from('scripts').update({ is_default: false }).eq('user_id', ownerId);
	}

	const { data: script, error: e } = await supabaseAdmin
		.from('scripts')
		.insert({
			user_id: user.id,
			title: title.trim(),
			opener: opener ?? null,
			elevator_pitch: elevatorPitch ?? null,
			discovery: discovery ?? null,
			closing: closing ?? null,
			client_id: clientId ?? null,
			campaign_id: campaignId ?? null,
			is_default: isDefault ?? false,
		})
		.select()
		.single();

	if (e) throw error(400, e.message);

	// Insert objections if provided
	if (objections?.length) {
		await supabaseAdmin.from('script_objections').insert(
			objections.map((o: Record<string, unknown>, i: number) => ({
				script_id: script.id, ...o, sort_order: i
			}))
		);
	}
	return json({ success: true });
};
