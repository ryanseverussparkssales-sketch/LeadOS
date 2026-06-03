import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';

export const GET = async ({ request, params, url }: { request: Request; params: { id: string }; url: URL }) => {
	const user = await requireAuth(request);
	const expiresIn = parseInt(url.searchParams.get('expires') ?? '3600');

	const { data: asset } = await supabaseAdmin
		.from('marketing_assets')
		.select('id, storage_path, storage_bucket, user_id, name, client_id')
		.eq('id', params.id)
		.single();

	if (!asset || !asset.storage_path) {
		return json({ error: 'Asset not found or not in storage' }, { status: 404 });
	}

	// Access check: owner or active team member under the asset owner
	const isOwner = asset.user_id === user.id;
	if (!isOwner) {
		const { data: tm } = await supabaseAdmin
			.from('team_members')
			.select('id')
			.eq('member_user_id', user.id)
			.eq('owner_user_id', asset.user_id)
			.eq('status', 'active')
			.single();
		if (!tm) return json({ error: 'Forbidden' }, { status: 403 });
	}

	const bucket = asset.storage_bucket ?? 'assets';
	const { data: signedData, error } = await supabaseAdmin.storage
		.from(bucket)
		.createSignedUrl(asset.storage_path, expiresIn);

	if (error || !signedData) {
		return json({ error: 'Could not generate URL' }, { status: 500 });
	}

	return json({
		signedUrl: signedData.signedUrl,
		expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
		name: asset.name,
	});
};
