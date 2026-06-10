import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await requireAuth(request);
		const ownerId = await getEffectiveUserId(user.id);

		const status      = url.searchParams.get('status');
		const company     = url.searchParams.get('company');
		const tags        = url.searchParams.get('tags')?.split(',').filter(Boolean);
		const sort        = url.searchParams.get('sort') ?? 'name';
		const order       = url.searchParams.get('order') ?? 'asc';
		const contactType = url.searchParams.get('contact_type');
		const leadSource  = url.searchParams.get('lead_source');
		const email       = url.searchParams.get('email');
		const title       = url.searchParams.get('title');
		const bizOnly     = url.searchParams.get('is_business') === 'true';
		const search      = url.searchParams.get('search')?.trim();
		const rawPage     = parseInt(url.searchParams.get('page') ?? '1');
		const rawLimit    = parseInt(url.searchParams.get('limit') ?? '50');
		const page        = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
		const limit       = Math.min(200, isNaN(rawLimit) ? 50 : rawLimit);
		const offset      = (page - 1) * limit;

		const validSortCols = ['name', 'company', 'last_called_at', 'call_count', 'email', 'title', 'status', 'created_at', 'contact_score'];
		const sortCol = validSortCols.includes(sort) ? sort : 'name';

		const includeTest = url.searchParams.get('include_test') === 'true';

		let query = supabaseAdmin
			.from('contacts')
			.select('*, tags:contact_tag_mappings(tag:contact_tags(*)), utm_source, utm_medium, utm_campaign, utm_content, utm_term, lead_metadata, lead_source_id')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.order(sortCol, { ascending: order === 'asc' });

		if (!includeTest) query = query.eq('is_test', false);

		if (status)      query = query.eq('status', status);
		if (company)     query = query.ilike('company', `%${company}%`);
		if (contactType) query = query.eq('contact_type', contactType);
		if (leadSource)  query = query.eq('lead_source', leadSource);
		if (email)       query = query.ilike('email', `%${email}%`);
		if (title)       query = query.ilike('title', `%${title}%`);
		if (bizOnly)     query = query.eq('is_business', true);
		if (search)      query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

		// Count with the same filters applied (was unfiltered — pagination totals were wrong when filtering)
		let countQuery = supabaseAdmin
			.from('contacts')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', ownerId)
			.is('deleted_at', null);
		if (!includeTest) countQuery = countQuery.eq('is_test', false);
		if (status)      countQuery = countQuery.eq('status', status);
		if (company)     countQuery = countQuery.ilike('company', `%${company}%`);
		if (contactType) countQuery = countQuery.eq('contact_type', contactType);
		if (leadSource)  countQuery = countQuery.eq('lead_source', leadSource);
		if (email)       countQuery = countQuery.ilike('email', `%${email}%`);
		if (title)       countQuery = countQuery.ilike('title', `%${title}%`);
		if (bizOnly)     countQuery = countQuery.eq('is_business', true);
		if (search)      countQuery = countQuery.or(`name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
		const { count: total } = await countQuery;

		// Apply pagination
		query = query.range(offset, offset + limit - 1);
		const { data, error } = await query;
		if (error) return json({ data: [], total: 0, page, limit, pages: 0 });

		let contacts = data ?? [];

		// Filter by tags client-side (OR: contact has any selected tag)
		if (tags?.length) {
			contacts = contacts.filter((c: Record<string, unknown>) => {
			const contactTags = (c.tags as Array<{ tag: { id: string } }>)?.map(t => t.tag?.id) ?? [];
			return tags.some(t => contactTags.includes(t));
		});
	}

	return json({ data: contacts, total: total ?? 0, page, limit, pages: Math.ceil((total ?? 0) / limit) });
	} catch (err) {
		console.error('[contacts/filtered] error:', err);
		return json({ data: [], total: 0, page: 1, limit: 50, pages: 0 });
	}
};
