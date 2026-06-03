import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { lookupType, items, enrichWithAI } = await request.json();
	// lookupType: 'phone' | 'email' | 'company' | 'domain'
	// items: array of strings to look up

	if (!items?.length) throw error(400, 'items required');

	const results: Array<{input:string; found:boolean; contact?:Record<string,unknown>; aiEnriched?:boolean}> = [];

	if (lookupType === 'phone') {
		for (const raw of items.slice(0, 200)) {
			const phoneNorm = normalizePhone(raw.trim());
			const { data } = await supabaseAdmin.from('contacts').select('id, name, company, phone, email, status').eq('user_id', ownerId).eq('phone_normalized', phoneNorm).maybeSingle();
			results.push({ input: raw, found: !!data, contact: data ?? undefined });
		}
	} else if (lookupType === 'email') {
		for (const raw of items.slice(0, 200)) {
			const emailNorm = raw.trim().toLowerCase();
			const { data } = await supabaseAdmin.from('contacts').select('id, name, company, phone, email, status').eq('user_id', ownerId).eq('email_normalized', emailNorm).maybeSingle();
			results.push({ input: raw, found: !!data, contact: data ?? undefined });
		}
	} else if (lookupType === 'company') {
		for (const name of items.slice(0, 100)) {
			const { data } = await supabaseAdmin.from('contacts').select('id, name, company, phone, email').eq('user_id', ownerId).ilike('company', `%${name.trim()}%`).limit(5);
			results.push({ input: name, found: !!(data?.length), contact: data?.[0] ?? undefined });
		}
	} else if (lookupType === 'domain' && enrichWithAI) {
		// AI enrichment: given domains, suggest what kind of company they are
		const domainList = items.slice(0, 20).join('\n');
		const prompt = `For each domain below, provide company info in JSON format. Keep it concise.
Domains:
${domainList}

Return JSON array:
[{ "domain": "example.com", "companyName": "Example Inc", "industry": "Software", "size": "50-200", "description": "Brief description", "likelyDecisionMaker": "VP of Sales" }]
Return ONLY the JSON array.`;

		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
		});

		let enriched: Record<string, unknown>[] = [];
		if (res.ok) {
			const d = await res.json() as { content: Array<{type:string;text:string}> };
			const text = d.content[0]?.text ?? '[]';
			try { const m = text.match(/\[[\s\S]*\]/); enriched = m ? JSON.parse(m[0]) : []; } catch { /* ignore */ }
		}

		for (const item of items.slice(0, 20)) {
			const info = enriched.find((e: Record<string,unknown>) => e.domain === item.trim());
			// Check if any contact exists with this domain in email
			const { data } = await supabaseAdmin.from('contacts').select('id, name, company, phone, email').eq('user_id', ownerId).ilike('email', `%@${item.trim()}`).limit(3);
			results.push({ input: item, found: !!(data?.length), contact: data?.[0] ?? undefined, aiEnriched: !!info, ...(info ? { enrichment: info } : {}) });
		}
	}

	const found = results.filter(r => r.found).length;
	const notFound = results.filter(r => !r.found).length;

	return json({ results, summary: { total: items.length, found, notFound } });
};
