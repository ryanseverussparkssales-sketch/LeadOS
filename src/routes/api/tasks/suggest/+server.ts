import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { rateLimitUser } from '$lib/server/rateLimit';
import { requireAuth } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	if (await rateLimitUser(user.id, { max: 30, windowMs: 60_000 })) throw error(429, "Rate limit exceeded — max 30 AI requests/minute");
	const { callId, contactName, contactCompany, outcome, summary, transcript } = await request.json();

	const prompt = `Based on this sales call, suggest 2-3 specific follow-up tasks.

Contact: ${contactName ?? 'Unknown'} at ${contactCompany ?? 'Unknown'}
Outcome: ${outcome ?? 'Unknown'}
Summary: ${summary ?? 'No summary'}
${transcript ? `Transcript excerpt: ${transcript.slice(0, 500)}` : ''}

Return JSON array of tasks:
[{ "title": string, "description": string, "taskType": "follow_up"|"email"|"call"|"meeting", "priority": "low"|"medium"|"high", "dueDaysFromNow": number }]
Return ONLY the JSON array.`;

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
	});

	if (!res.ok) throw error(500, 'Claude failed');
	const data = await res.json() as { content: Array<{type:string;text:string}> };
	const text = data.content[0]?.text ?? '[]';

	let suggestions = [];
	try {
		const match = text.match(/\[[\s\S]*\]/);
		suggestions = match ? JSON.parse(match[0]) : [];
	} catch { suggestions = []; }

	// Add due dates
	suggestions = suggestions.map((s: Record<string, unknown>) => ({
		...s,
		dueDate: s.dueDaysFromNow ? new Date(Date.now() + (s.dueDaysFromNow as number) * 86400000).toISOString() : null,
		aiSuggested: true,
		callId,
	}));

	return json({ suggestions });
};
