import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const map: [string,string][] = [
		['caption','caption'],['hashtags','hashtags'],['platforms','platforms'],
		['status','status'],['scheduledAt','scheduled_at'],['publishedAt','published_at'],
		['postUrl','post_url'],['engagementLikes','engagement_likes'],
		['engagementComments','engagement_comments'],['engagementShares','engagement_shares'],
		['engagementReach','engagement_reach'],['notes','notes'],
	];
	const update: Record<string,unknown> = {};
	for (const [js,db] of map) if (b[js] !== undefined) update[db] = b[js];
	const { data, error: e } = await supabaseAdmin.from('social_posts').update(update)
		.eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('social_posts').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
