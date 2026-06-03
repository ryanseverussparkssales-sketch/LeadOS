import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';

export const GET = async ({ request, params, url }: { request: Request; params: { id: string }; url: URL }) => {
	const user = await requireAuth(request);
	const expiresIn = parseInt(url.searchParams.get('expires') ?? '3600'); // seconds, default 1hr

	// Get the document record
	const { data: doc } = await supabaseAdmin
		.from('contact_documents')
		.select('id, storage_path, bucket_name, user_id, name')
		.eq('id', params.id)
		.is('deleted_at', null)
		.single();

	if (!doc) return json({ error: 'Not found' }, { status: 404 });

	// Verify access: owner or active team member under the doc owner
	const isOwner = doc.user_id === user.id;
	if (!isOwner) {
		const { data: tm } = await supabaseAdmin
			.from('team_members')
			.select('id, status')
			.eq('member_user_id', user.id)
			.eq('owner_user_id', doc.user_id)
			.eq('status', 'active')
			.single();
		if (!tm) return json({ error: 'Forbidden' }, { status: 403 });
	}

	if (!doc.storage_path) {
		return json({ error: 'File not in storage' }, { status: 400 });
	}

	const bucket = doc.bucket_name ?? 'documents';
	const { data: signedData, error } = await supabaseAdmin.storage
		.from(bucket)
		.createSignedUrl(doc.storage_path, expiresIn);

	if (error || !signedData) {
		return json({ error: 'Could not generate signed URL' }, { status: 500 });
	}

	return json({
		signedUrl: signedData.signedUrl,
		expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
		filename: doc.name,
	});
};
