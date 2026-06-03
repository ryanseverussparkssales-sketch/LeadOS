import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const type = url.searchParams.get('type');
	const category = url.searchParams.get('category');

	let q = supabaseAdmin.from('templates').select('*').eq('user_id', ownerId).order('category').order('name');
	if (type) q = q.eq('type', type);
	if (category) q = q.eq('category', category);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, type, category, subject, body, generateFromDescription } = await request.json();

	// AI generation mode
	if (generateFromDescription && body) {
		const prompt = `Write a ${type === 'sms' ? 'text message (SMS, max 160 chars)' : 'professional email'} template for a sales ${category?.replace(/_/g,' ') ?? 'outreach'}.

Description: ${body}

Requirements:
- Use {name} for contact name, {company} for their company, {rep_name} for the sales rep, {product} for the product
- Be natural and conversational, not robotic
- ${type === 'sms' ? 'Keep under 160 characters' : 'Include a clear subject line and body under 150 words'}
- End with a clear call to action

Return JSON:
{
  "subject": "${type === 'email' ? 'Subject line here' : ''}",
  "body": "Template body with {name} variables"
}`;

		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
		});
		if (res.ok) {
			const d = await res.json() as { content: Array<{type:string;text:string}> };
			const text = d.content[0]?.text ?? '';
			try {
				const match = text.match(/\{[\s\S]*\}/);
				const parsed = match ? JSON.parse(match[0]) : {};
				const { data: saved, error: e } = await supabaseAdmin.from('templates').insert({ user_id: ownerId, name: name?.trim() ?? 'AI Template', type: type ?? 'email', category: category ?? 'general', subject: parsed.subject || null, body: parsed.body || body }).select().single();
				if (e) throw error(400, e.message);
				return json({ ...saved, generated: true });
			} catch { /* fall through to manual save */ }
		}
	}

	if (!name?.trim() || !body?.trim()) throw error(400, 'name and body required');
	const { data, error: e } = await supabaseAdmin.from('templates').insert({ user_id: ownerId, name: name.trim(), type: type ?? 'email', category: category ?? 'general', subject: subject?.trim() || null, body: body.trim() }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
