import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

function buildStoragePath(ownerId: string, clientId: string | null, category: string, filename: string): string {
	const ts = Date.now();
	const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
	if (clientId) {
		return `${ownerId}/clients/${clientId}/${category}/${ts}-${safe}`;
	}
	return `${ownerId}/general/${category}/${ts}-${safe}`;
}

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const contactId = formData.get('contact_id') as string | null;
	const dealId = formData.get('deal_id') as string | null;
	const category = (formData.get('category') as string) ?? 'general';
	const customName = formData.get('name') as string | null;
	const clientId = formData.get('client_id') as string | null;
	const projectId = formData.get('project_id') as string | null;
	const knowledgeBase = formData.get('knowledge_base') === 'true';
	const kbType = (formData.get('kb_type') as string) ?? 'general';
	const bucketName = (formData.get('bucket_name') as string) ?? 'documents';

	if (!file) {
		// URL-based upload (just save metadata)
		const fileUrl = formData.get('url') as string;
		const name = customName ?? formData.get('name') as string ?? 'Document';
		if (!fileUrl) throw error(400, 'file or url required');
		const insertData: Record<string, unknown> = {
			user_id: ownerId, name, file_url: fileUrl,
			contact_id: contactId ?? null, deal_id: dealId ?? null,
			document_category: category,
		};
		if (clientId) insertData.client_id = clientId;
		if (projectId) insertData.project_id = projectId;
		const { data, error: e } = await supabaseAdmin.from('contact_documents').insert(insertData).select().single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	// Knowledge Base path — extract text and save to client_knowledge
	if (knowledgeBase && clientId) {
		let content = '';
		try {
			content = await file.text();
			if (content.length > 10000) content = content.slice(0, 10000) + '... [truncated]';
		} catch {
			content = `[Binary file: ${file.name}]`;
		}

		const { data: kb, error: kbErr } = await supabaseAdmin.from('client_knowledge').insert({
			user_id: ownerId,
			client_id: clientId,
			title: customName ?? file.name ?? 'Document',
			content,
			knowledge_type: kbType,
		}).select().single();

		if (kbErr) throw error(400, kbErr.message);
		return json({ ...kb, savedAs: 'knowledge_base' });
	}

	// Upload to Supabase Storage using client-scoped path
	const fileName = buildStoragePath(ownerId, clientId, category, file.name);
	const arrayBuffer = await file.arrayBuffer();
	const buffer = new Uint8Array(arrayBuffer);

	const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
		.from(bucketName)
		.upload(fileName, buffer, { contentType: file.type, upsert: false });

	if (uploadErr) {
		// Bucket might not exist — save with placeholder and instruct user
		const placeholderData: Record<string, unknown> = {
			user_id: ownerId,
			name: customName ?? file.name,
			file_url: `pending-upload:${file.name}`,
			file_type: file.type,
			file_size: file.size,
			contact_id: contactId ?? null,
			deal_id: dealId ?? null,
			document_category: category,
			bucket_name: bucketName,
		};
		if (clientId) placeholderData.client_id = clientId;
		if (projectId) placeholderData.project_id = projectId;
		const { data: doc } = await supabaseAdmin.from('contact_documents').insert(placeholderData).select().single();
		return json({ ...doc, uploadError: `Create a storage bucket named "${bucketName}" in Supabase Dashboard → Storage to enable file uploads` });
	}

	// Generate a signed URL for immediate access (1 hour)
	const { data: signedData } = await supabaseAdmin.storage
		.from(bucketName)
		.createSignedUrl(fileName, 3600);
	return json({ success: true });
};
