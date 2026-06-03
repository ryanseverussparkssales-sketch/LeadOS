import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';

export const POST = async ({ request }: { request: Request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const clientId = formData.get('client_id') as string | null;
	const category = (formData.get('category') as string) || 'general';
	const name = (formData.get('name') as string) || file?.name || 'Untitled';
	const assetType = (formData.get('asset_type') as string) || 'image';
	const campaignId = formData.get('campaign_id') as string | null;
	const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : [];

	if (!file) return json({ error: 'No file provided' }, { status: 400 });
	if (!clientId) return json({ error: 'client_id is required for asset uploads' }, { status: 400 });

	// Verify user can write to this client
	const isOwner = await supabaseAdmin
		.from('clients')
		.select('id')
		.eq('id', clientId)
		.eq('user_id', ownerId)
		.single()
		.then(r => !!r.data);

	if (!isOwner) {
		// Check team member write access
		const { data: access } = await supabaseAdmin
			.from('team_members')
			.select('team_member_clients(access_level)')
			.eq('member_user_id', user.id)
			.eq('status', 'active')
			.single();

		const level = (access as any)?.team_member_clients?.[0]?.access_level;
		if (!level || !['write', 'manage'].includes(level)) {
			return json({ error: 'No write access to this client' }, { status: 403 });
		}
	}

	// Build client-scoped path: {ownerId}/clients/{clientId}/{category}/{ts}-{filename}
	const ts = Date.now();
	const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
	const storagePath = `${ownerId}/clients/${clientId}/${category}/${ts}-${safeName}`;

	// Upload to assets bucket
	const buffer = await file.arrayBuffer();
	const { error: uploadError } = await supabaseAdmin.storage
		.from('assets')
		.upload(storagePath, buffer, {
			contentType: file.type,
			upsert: false,
		});

	if (uploadError) {
		console.error('[assets/upload]', uploadError.message);
		return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
	}

	// Get signed URL for immediate display (1 hour)
	const { data: signedData } = await supabaseAdmin.storage
		.from('assets')
		.createSignedUrl(storagePath, 3600);

	// Insert asset record
	const { data: asset, error: dbError } = await supabaseAdmin
		.from('marketing_assets')
		.insert({
			user_id: ownerId,
			client_id: clientId,
			campaign_id: campaignId ?? null,
			name,
			asset_type: assetType,
			file_url: signedData?.signedUrl ?? '',
			storage_path: storagePath,
			storage_bucket: 'assets',
			file_size: file.size,
			mime_type: file.type,
			original_filename: file.name,
			uploaded_by: user.id,
			status: 'draft',
			source: 'upload',
			tags,
		})
		.select()
		.single();

	if (dbError) {
		// Cleanup storage on DB failure
		await supabaseAdmin.storage.from('assets').remove([storagePath]);
		return json({ error: dbError.message }, { status: 500 });
	}

	// Record version
	await supabaseAdmin.from('asset_versions').insert({
		asset_id: asset.id,
		version: 1,
		storage_path: storagePath,
		storage_bucket: 'assets',
		file_size: file.size,
		mime_type: file.type,
		uploaded_by: user.id,
		upload_note: 'Initial upload',
	});

	return json({ ...asset, signedUrl: signedData?.signedUrl });
};
