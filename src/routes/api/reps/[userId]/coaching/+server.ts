import { json } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

/**
 * GET /api/reps/:userId/coaching
 * Returns a personalized weekly coaching card for a rep.
 * Uses the last 30 calls with quality scores to identify patterns.
 * Pass userId = "me" to get the authenticated user's own card.
 */
export const GET = async ({ request, params }: { request: Request; params: { userId: string } }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	if (await rateLimitUser(user.id, { max: 10, windowMs: 60_000 })) return json({ available: false, reason: 'Rate limit exceeded' });
	const targetUserId = params.userId === 'me' ? user.id : params.userId;

	// Fetch last 30 scored calls
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id, outcome, duration, quality_score, quality_breakdown, created_at, contact_id, contacts(name, company)')
		.eq('user_id', targetUserId)
		.not('quality_score', 'is', null)
		.order('created_at', { ascending: false })
		.limit(30);

	if (!calls || calls.length < 5) {
		return json({
			available: false,
			reason: `Need at least 5 scored calls (have ${calls?.length ?? 0})`
		});
	}

	// Aggregate metrics
	const scores = calls.map(c => c.quality_score as number);
	const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
	const trend = scores.length >= 10
		? Math.round(scores.slice(0, 5).reduce((a, b) => a + b, 0) / 5) -
		  Math.round(scores.slice(-5).reduce((a, b) => a + b, 0) / 5)
		: 0; // positive = improving recently

	const breakdowns = calls
		.map(c => c.quality_breakdown as Record<string, unknown>)
		.filter(Boolean);

	const avgTalkRatio = breakdowns.reduce((sum, b) => sum + (Number(b.talkListenRatio) || 0), 0) / breakdowns.length;
	const avgDiscoveryQ = breakdowns.reduce((sum, b) => sum + (Number(b.discoveryQuestions) || 0), 0) / breakdowns.length;
	const objHandleRate = breakdowns.filter(b => b.objectionHandled === true).length / breakdowns.length;

	const outcomeMap: Record<string, number> = {};
	for (const c of calls) {
		const o = (c.outcome as string) ?? 'unknown';
		outcomeMap[o] = (outcomeMap[o] ?? 0) + 1;
	}

	// Correlate talk ratio with outcomes
	const winOutcomes = new Set([
		'appointment_set', 'demo_scheduled', 'callback', 'signed_up',
		'investment_interest', 'meeting_confirmed', 'answered',
		'info_requested', 'referral', 'follow_up_agreed', 'proposal_requested'
	]);
	const winCalls = calls.filter(c => winOutcomes.has(c.outcome as string));
	const lossCalls = calls.filter(c => !winOutcomes.has(c.outcome as string) && c.outcome !== 'no_answer');

	const winAvgTalkRatio = winCalls.length
		? winCalls.reduce((s, c) => s + (Number((c.quality_breakdown as any)?.talkListenRatio) || 0), 0) / winCalls.length
		: null;
	const lossAvgTalkRatio = lossCalls.length
		? lossCalls.reduce((s, c) => s + (Number((c.quality_breakdown as any)?.talkListenRatio) || 0), 0) / lossCalls.length
		: null;

	// Build AI prompt
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const prompt = `You are a sales coaching expert. Analyze this rep's performance data and write a personalized weekly coaching card.

Performance summary (last ${calls.length} scored calls):
- Average quality score: ${avgScore}/100
- Score trend: ${trend > 3 ? `improving (+${trend} pts recently)` : trend < -3 ? `declining (${trend} pts recently)` : 'stable'}
- Average talk ratio: ${Math.round(avgTalkRatio)}% (rep talking)
- Average discovery questions per call: ${avgDiscoveryQ.toFixed(1)}
- Objection handled rate: ${Math.round(objHandleRate * 100)}%
- Win rate: ${Math.round(winCalls.length / calls.length * 100)}% (${winCalls.length}/${calls.length} calls)
${winAvgTalkRatio && lossAvgTalkRatio ? `- Talk ratio on wins: ${Math.round(winAvgTalkRatio)}% vs losses: ${Math.round(lossAvgTalkRatio)}%` : ''}
- Outcome distribution: ${Object.entries(outcomeMap).map(([k, v]) => `${k}: ${v}`).join(', ')}

Return JSON ONLY:
{
  "weeklyScore": <number 1-100, weighted average>,
  "headline": "<one sentence assessment, e.g. 'Strong week — your talk ratio is hurting close rates'>",
  "topStrength": "<specific strength with data reference>",
  "topImprovement": "<specific, actionable improvement with data>",
  "focusDrill": "<one concrete drill or technique to practice this week>",
  "callTargets": {
    "talkRatioTarget": <number — ideal % for this rep based on their data>,
    "discoveryQTarget": <number — questions per call to aim for>,
    "scoreTarget": <number — realistic improvement target>
  },
  "momentum": <"rising" | "steady" | "dropping">
}`;

	try {
		const message = await anthropic.messages.create({
			model: 'claude-sonnet-4-5',
			max_tokens: 700,
			system: 'You are an expert sales coach. Analyze call performance data and generate specific, data-driven coaching. Return only valid JSON.',
			messages: [{ role: 'user', content: prompt }]
		});

		const text = message.content[0].type === 'text' ? message.content[0].text : '';
		const clean = text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
		const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
		const coaching = JSON.parse(clean.slice(start, end + 1));
		return json({ coaching });
	} catch (e) {
		console.error('[coaching]', e);
		return json({ coaching: null });
	}
};
