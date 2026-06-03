import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const contactId = url.searchParams.get('contact_id');
	const dealId = url.searchParams.get('deal_id');
	let q = supabaseAdmin.from('contact_documents').select('*').eq('user_id', ownerId).order('created_at', { ascending: false });
	if (contactId) q = q.eq('contact_id', contactId);
	if (dealId) q = q.eq('deal_id', dealId);
	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, fileUrl, fileType, fileSize, contactId, dealId } = await request.json();
	if (!name || !fileUrl) throw error(400, 'name and fileUrl required');
	const { data, error: e } = await supabaseAdmin.from('contact_documents').insert({ user_id: ownerId, name, file_url: fileUrl, file_type: fileType ?? null, file_size: fileSize ?? null, contact_id: contactId ?? null, deal_id: dealId ?? null }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
