import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const map: [string, string][] = [
		['name','name'],['assetType','asset_type'],['status','status'],
		['fileUrl','file_url'],['thumbnailUrl','thumbnail_url'],
		['platform','platform'],['tags','tags'],['notes','notes'],
		['canvaDesignId','canva_design_id'],['canvaEditUrl','canva_edit_url'],
	];
	const update: Record<string,unknown> = {};
	for (const [js, db] of map) if (b[js] !== undefined) update[db] = b[js];

	const { data, error: e } = await supabaseAdmin
		.from('marketing_assets').update(update)
		.eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('marketing_assets').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
