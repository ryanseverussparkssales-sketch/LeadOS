import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	if (await rateLimitUser(user.id, { max: 10, windowMs: 60_000 })) throw error(429, 'Rate limit exceeded — max 10 script improvements/minute');
	const ownerId = await getEffectiveUserId(user.id);

	// Get script + performance data
	const { data: script } = await supabaseAdmin.from('scripts').select('*, objections:script_objections(*)').eq('id', params.id).eq('user_id', ownerId).single();
	if (!script) throw error(404, 'Script not found');

	// Get calls using this script
	const { data: calls } = await supabaseAdmin.from('calls').select('outcome, quality_score, quality_breakdown, summary, raw_transcript').eq('script_id', params.id).not('raw_transcript', 'is', null).order('created_at', { ascending: false }).limit(20);

	// Get objection encounter data
	const { data: objLogs } = await supabaseAdmin
		.from('script_objection_logs')
		.select('objection_id, objection:script_objections(objection)')
		.eq('script_id', params.id);

	const callList = calls ?? [];
	const totalCalls = callList.length;
	const positiveOutcomes = ['answered', 'callback', 'interested'];
	const successCount = callList.filter(c => positiveOutcomes.includes(c.outcome ?? '')).length;
	const avgQuality = callList.filter(c => c.quality_score).reduce((s, c) => s + c.quality_score!, 0) / (callList.filter(c => c.quality_score).length || 1);

	// Objection frequency
	const objFreq: Record<string, number> = {};
	for (const log of objLogs ?? []) {
		const obj = (log.objection as unknown as { objection: string })?.objection ?? log.objection_id;
		objFreq[obj] = (objFreq[obj] ?? 0) + 1;
	}

	// Sample successful and unsuccessful transcripts
	const successful = callList.filter(c => positiveOutcomes.includes(c.outcome ?? '')).slice(0, 3).map(c => c.summary ?? '').join('\n');
	const unsuccessful = callList.filter(c => !positiveOutcomes.includes(c.outcome ?? '')).slice(0, 3).map(c => c.summary ?? '').join('\n');

	const prompt = `You are an expert sales trainer analyzing call data to improve a cold calling script.

CURRENT SCRIPT: "${script.title}"
Opener: ${script.opener ?? 'None'}
Pitch: ${script.elevator_pitch ?? 'None'}
Discovery: ${script.discovery ?? 'None'}
Close: ${script.closing ?? 'None'}

PERFORMANCE DATA (last ${totalCalls} calls):
- Success rate: ${totalCalls ? Math.round(successCount / totalCalls * 100) : 0}%
- Avg quality score: ${Math.round(avgQuality)}/100

TOP OBJECTIONS ENCOUNTERED:
${Object.entries(objFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([o, c]) => `- "${o}" (${c}x)`).join('\n') || 'No data yet'}

SUCCESSFUL CALL SUMMARIES:
${successful || 'No successful calls yet'}

UNSUCCESSFUL CALL SUMMARIES:
${unsuccessful || 'No data yet'}

Provide specific, actionable improvements. Return JSON:
{
  "overallScore": 1-100,
  "diagnosis": "2-3 sentence diagnosis of what is working and what is not",
  "improvements": [
    {
      "section": "opener|pitch|discovery|closing|objection:[name]",
      "issue": "What is wrong with the current version",
      "suggestion": "Specific improved wording to use instead",
      "whyItWorks": "Brief explanation of why this change will improve results"
    }
  ],
  "quickWins": ["3 immediate changes that will have biggest impact"],
  "strengthsToKeep": ["What is working that should NOT be changed"]
}`;

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
	});

	if (!res.ok) throw error(500, 'Claude analysis failed');
	const data = await res.json() as { content: Array<{ type: string; text: string }> };
	const text = data.content[0]?.text ?? '';

	let analysis;
	try {
		const match = text.match(/\{[\s\S]*\}/);
		analysis = match ? JSON.parse(match[0]) : null;
	} catch { analysis = { diagnosis: text, improvements: [] }; }

	return json({ analysis, stats: { totalCalls, successCount, avgQuality: Math.round(avgQuality * 10) / 10 } });
};
