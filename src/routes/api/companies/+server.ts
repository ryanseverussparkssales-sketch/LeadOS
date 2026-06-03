import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);
    const search = url.searchParams.get('search') ?? '';
    const clientId = url.searchParams.get('client_id');
    const limit = parseInt(url.searchParams.get('limit') ?? '100');

    let q = supabaseAdmin
        .from('companies')
        .select('*, client:clients(name), contact_count:contacts(count)')
        .eq('user_id', ownerId)
        .is('deleted_at', null)
        .order('name')
        .limit(limit);

    if (search) q = q.ilike('name', `%${search}%`);
    if (clientId) q = q.eq('client_id', clientId);

    const { data, error: e } = await q;
    if (e) throw error(500, e.message);
    return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
    const user = await requireAuth(request);
    const body = await request.json();
    const { name, phone, email, website, industry, address, city, state, description, company_type, size, linkedin_url, notes, tags, client_id } = body;

    if (!name?.trim()) throw error(400, 'name required');

    const { data, error: e } = await supabaseAdmin.from('companies').insert({
        user_id: user.id,
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        website: website || null,
        industry: industry || null,
        address: address || null,
        city: city || null,
        state: state || null,
        description: description || null,
        company_type: company_type || 'prospect',
        size: size || null,
        linkedin_url: linkedin_url || null,
        notes: notes || null,
        tags: tags || null,
        client_id: client_id || null,
    }).select('*, client:clients(name)').single();

    if (e) throw error(400, e.message);
    return json(data, { status: 201 });
};
