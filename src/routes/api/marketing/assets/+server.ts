import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('clientId');
	const campaignId = url.searchParams.get('campaignId');
	const platform = url.searchParams.get('platform');
	const status = url.searchParams.get('status');

	let q = supabaseAdmin
		.from('marketing_assets')
		.select('*, client:clients(name), campaign:campaigns(name)')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	if (clientId) q = q.eq('client_id', clientId);
	if (campaignId) q = q.eq('campaign_id', campaignId);
	if (platform) q = q.eq('platform', platform);
	if (status) q = q.eq('status', status);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();

	const { data, error: e } = await supabaseAdmin
		.from('marketing_assets')
		.insert({
			user_id: user.id,
			client_id: b.clientId ?? null,
			campaign_id: b.campaignId ?? null,
			name: b.name,
			asset_type: b.assetType ?? 'image',
			source: b.source ?? 'upload',
			file_url: b.fileUrl ?? null,
			thumbnail_url: b.thumbnailUrl ?? null,
			canva_design_id: b.canvaDesignId ?? null,
			canva_edit_url: b.canvaEditUrl ?? null,
			prompt: b.prompt ?? null,
			width: b.width ?? null,
			height: b.height ?? null,
			format: b.format ?? null,
			platform: b.platform ?? 'general',
			status: b.status ?? 'draft',
			tags: b.tags ?? [],
			notes: b.notes ?? null,
		})
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
