import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	if (await rateLimitUser(user.id, { max: 5, windowMs: 60_000 })) throw error(429, 'Rate limit exceeded — max 5 insight requests/minute');
	const ownerId = await getEffectiveUserId(user.id);

	const { data: client } = await supabaseAdmin
		.from('clients')
		.select('id, name')
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.maybeSingle();
	if (!client) throw error(404, 'Client not found');

	const [knowledgeRes, projectsRes, contactsRes, callsRes] = await Promise.all([
		supabaseAdmin.from('client_knowledge').select('title, knowledge_type, content').eq('client_id', params.id).eq('user_id', ownerId).limit(10),
		supabaseAdmin.from('projects').select('id, name, campaigns(id, name, status, call_lists(id, name, call_list_contacts(count)))').eq('client_id', params.id).limit(5),
		supabaseAdmin.from('contact_client_assoc').select('contact:contacts(id, name, company, status, contact_score, phone)').eq('client_id', params.id).eq('user_id', ownerId).limit(20),
		supabaseAdmin.from('calls').select('outcome, call_duration_seconds, created_at, summary').eq('user_id', ownerId).order('created_at', { ascending: false }).limit(30),
	]);

	const knowledge = knowledgeRes.data ?? [];
	const projects = projectsRes.data ?? [];
	const contacts = (contactsRes.data ?? []).map((r: any) => r.contact).filter(Boolean);
	const calls = callsRes.data ?? [];

	const answeredCalls = calls.filter((c: any) => c.outcome === 'answered').length;
	const totalCalls = calls.length;
	const avgDuration = totalCalls > 0
		? Math.round(calls.filter((c: any) => c.call_duration_seconds).reduce((s: number, c: any) => s + (c.call_duration_seconds ?? 0), 0) / Math.max(answeredCalls, 1))
		: 0;

	function smartTruncate(text: string, maxChars: number): string {
		if (text.length <= maxChars) return text;
		const truncated = text.slice(0, maxChars);
		const lastPara = truncated.lastIndexOf('\n\n');
		const lastSentence = truncated.lastIndexOf('. ');
		const cutAt = lastPara > maxChars * 0.6 ? lastPara : lastSentence > maxChars * 0.6 ? lastSentence + 1 : maxChars;
		return truncated.slice(0, cutAt) + '…';
	}

	const prompt = `You are an AI sales analyst reviewing data for client: ${client.name}

KNOWLEDGE BASE:
${knowledge.map((k: any) => `[${k.knowledge_type}] ${k.title}: ${smartTruncate(k.content ?? '', 1000)}`).join('\n') || 'None'}

PROJECTS & CAMPAIGNS:
${projects.map((p: any) => `- ${p.name}: ${p.campaigns?.map((c: any) => c.name).join(', ')}`).join('\n') || 'None'}

CONTACTS: ${contacts.length} linked contacts
Top contacts: ${contacts.slice(0, 5).map((c: any) => c.name + (c.company ? ` (${c.company})` : '')).join(', ')}

CALL STATS (last 30 calls):
- Total calls: ${totalCalls}
- Answered: ${answeredCalls} (${totalCalls > 0 ? Math.round(answeredCalls / totalCalls * 100) : 0}% connect rate)
- Avg call duration: ${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s

Generate a concise client insights report covering:
1. **Relationship Status** — what stage is this client at?
2. **Campaign Health** — are campaigns performing? Any gaps?
3. **Top Opportunities** — what's the best next move?
4. **Risks / Watch-outs** — anything to flag?
5. **Recommended Actions** — 3 specific action items

Be direct and actionable. Use the actual data. Max 300 words.`;

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: { 'x-api-key': env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
	});

	if (!res.ok) throw error(500, 'AI insights failed');
	return json({ success: true });
};
