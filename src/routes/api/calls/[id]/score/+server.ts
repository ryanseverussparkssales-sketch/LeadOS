import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	const { data: call } = await supabaseAdmin
		.from('calls')
		.select('id, transcript, outcome, duration, contact_id, script_id')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.is('deleted_at', null)
		.single();

	if (!call) return json({ error: 'Call not found' }, { status: 404 });
	if (!call.transcript) return json({ error: 'No transcript available' }, { status: 400 });

	// FIX 1: Raise transcript limit and append truncation note
	const MAX_TRANSCRIPT = 6000;
	const transcriptText = call.transcript.length > MAX_TRANSCRIPT
		? call.transcript.slice(0, MAX_TRANSCRIPT) + '\n\n[Transcript truncated — showing first 6000 of ' + call.transcript.length + ' characters]'
		: call.transcript;

	// FIX 2: Fetch rep context for personalized coaching
	const [repHistoryResult, scriptResult] = await Promise.all([
		// Last 30 scored calls for this user
		supabaseAdmin
			.from('calls')
			.select('outcome, quality_score, quality_breakdown')
			.eq('user_id', user.id)
			.not('quality_score', 'is', null)
			.order('created_at', { ascending: false })
			.limit(30),

		// Script used on this call (if call has script_id)
		call.script_id
			? supabaseAdmin
				.from('scripts')
				.select('title, opener')
				.eq('id', call.script_id)
				.single()
			: Promise.resolve({ data: null })
	]);

	const repHistory = repHistoryResult.data ?? [];

	// Build rep context string
	let repContext = '';
	if (repHistory.length >= 5) {
		const scores = repHistory.map(c => c.quality_score).filter(Boolean) as number[];
		const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
		const outcomes = repHistory.reduce((acc: Record<string, number>, c) => {
			acc[c.outcome] = (acc[c.outcome] ?? 0) + 1;
			return acc;
		}, {});
		const topOutcomes = Object.entries(outcomes)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([o, n]) => `${o} (${n}x)`)
			.join(', ');

		// Calculate avg talk ratio from quality_breakdown
		const talkRatios = repHistory
			.map(c => (c.quality_breakdown as any)?.talkListenRatio)
			.filter((r): r is number => typeof r === 'number');
		const avgTalkRatio = talkRatios.length
			? Math.round(talkRatios.reduce((a, b) => a + b, 0) / talkRatios.length)
			: null;

		repContext = `\nRep baseline (last ${repHistory.length} calls):
- Average quality score: ${Math.round(avgQualityScore ?? 0)}/100
- Top outcomes: ${topOutcomes}
${avgTalkRatio !== null ? `- Avg talk ratio: ${avgTalkRatio}%` : ''}`;
	}

	// Build prompt for Claude
	const prompt = `Score this sales call on a scale of 0-100. Return JSON only.

Call transcript: ${transcript.slice(0, 3000)}
Call outcome: ${outcome ?? 'unknown'}
${repContext}

Return: {"overallScore": <0-100>, "talkListenRatio": <0-100>, "discoveryQuestions": <count 0-20>, "sentimentArc": "<negative|neutral|positive>", "coachingNote": "<1 sentence specific feedback>", "breakdown": {"opener": <0-25>, "discovery": <0-25>, "pitch": <0-25>, "close": <0-25>}}`;

	const { default: Anthropic } = await import('@anthropic-ai/sdk');
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	const msg = await anthropic.messages.create({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 300,
		messages: [{ role: 'user', content: prompt }],
	});

	const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
	const clean = text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
	const parsed = JSON.parse(clean);

	// Persist to calls table
	await supabaseAdmin.from('calls').update({
		quality_score: parsed.overallScore,
		quality_breakdown: parsed,
	}).eq('id', params.id);

	return json(parsed);
};
