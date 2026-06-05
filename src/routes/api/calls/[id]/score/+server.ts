import { json } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { env } from '$env/dynamic/private';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	const ownerId = await getEffectiveUserId(user.id);

	const { data: call } = await supabaseAdmin
		.from('calls')
		.select('id, raw_transcript, outcome, call_duration_seconds, contact_id, script_id')
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.single();

	if (!call) return json({ error: 'Call not found' }, { status: 404 });
	if (!call.raw_transcript) return json({ error: 'No transcript available' }, { status: 400 });

	const MAX_TRANSCRIPT = 6000;
	const transcriptText = call.raw_transcript.length > MAX_TRANSCRIPT
		? call.raw_transcript.slice(0, MAX_TRANSCRIPT) + `\n\n[Transcript truncated — showing first 6000 of ${call.raw_transcript.length} characters]`
		: call.raw_transcript;

	// Rep context for personalized coaching — last 30 scored calls + the script used.
	const [repHistoryResult, scriptResult] = await Promise.all([
		supabaseAdmin
			.from('calls')
			.select('outcome, quality_score, quality_breakdown')
			.eq('user_id', ownerId)
			.not('quality_score', 'is', null)
			.order('created_at', { ascending: false })
			.limit(30),
		call.script_id
			? supabaseAdmin.from('scripts').select('title, opener').eq('id', call.script_id).single()
			: Promise.resolve({ data: null })
	]);
	void scriptResult;

	const repHistory = repHistoryResult.data ?? [];

	let repContext = '';
	if (repHistory.length >= 5) {
		const scores = repHistory.map(c => c.quality_score).filter(Boolean) as number[];
		const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
		const outcomes = repHistory.reduce((acc: Record<string, number>, c) => {
			if (c.outcome) acc[c.outcome] = (acc[c.outcome] ?? 0) + 1;
			return acc;
		}, {});
		const topOutcomes = Object.entries(outcomes)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([o, n]) => `${o} (${n}x)`)
			.join(', ');

		const talkRatios = repHistory
			.map(c => (c.quality_breakdown as any)?.talkListenRatio)
			.filter((r): r is number => typeof r === 'number');
		const avgTalkRatio = talkRatios.length
			? Math.round(talkRatios.reduce((a, b) => a + b, 0) / talkRatios.length)
			: null;

		repContext = `\nRep baseline (last ${repHistory.length} calls):
- Average quality score: ${avgScore}/100
- Top outcomes: ${topOutcomes}
${avgTalkRatio !== null ? `- Avg talk ratio: ${avgTalkRatio}%` : ''}`;
	}

	const prompt = `Score this sales call on a scale of 0-100. Return JSON only.

Call transcript: ${transcriptText.slice(0, 3000)}
Call outcome: ${call.outcome ?? 'unknown'}
${repContext}

Return: {"overallScore": <0-100>, "talkListenRatio": <0-100>, "discoveryQuestions": <count 0-20>, "sentimentArc": "<negative|neutral|positive>", "coachingNote": "<1 sentence specific feedback>", "breakdown": {"opener": <0-25>, "discovery": <0-25>, "pitch": <0-25>, "close": <0-25>}}`;

	let parsed: any;
	try {
		const msg = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 300,
			messages: [{ role: 'user', content: prompt }],
		});
		const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
		const clean = text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
		parsed = JSON.parse(clean);
	} catch (e) {
		console.error('[calls/score] AI scoring failed:', e);
		return json({ error: 'Could not score this call' }, { status: 502 });
	}

	await supabaseAdmin.from('calls').update({
		quality_score: parsed.overallScore,
		quality_breakdown: parsed,
	}).eq('id', params.id).eq('user_id', ownerId);

	return json(parsed);
};
