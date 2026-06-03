import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

export const _INTERVIEW_QUESTIONS = [
	"Tell me about yourself and your sales background — why do you do this?",
	"Walk me through how you handle a gatekeeper who tells you the decision-maker is in a meeting.",
	"You've just heard 'We already use a competitor and we're happy.' What do you say next?",
	"What's your process for doing research on a prospect before you call?",
	"Describe your best quarter. What were you doing differently that made it work?",
];

// GET: fetch my interview answers
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('rep_interview_answers')
		.select('*')
		.eq('user_id', user.id)
		.order('question_index');
	return json({ questions: _INTERVIEW_QUESTIONS, answers: data ?? [] });
};

// POST: submit a transcript for scoring, or save recording URL
// Body: { questionIndex, transcript?, recordingUrl? }
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { questionIndex, transcript, recordingUrl } = await request.json();

	if (questionIndex === undefined || questionIndex < 0 || questionIndex >= _INTERVIEW_QUESTIONS.length) {
		throw error(400, 'Invalid questionIndex');
	}

	let score: number | null = null;
	let feedback: string | null = null;

	if (transcript?.trim()) {
		// Score with Claude
		try {
			const { env } = await import('$env/dynamic/private');
			const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
			const msg = await anthropic.messages.create({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 400,
				messages: [{
					role: 'user',
					content: `You are evaluating a sales rep's answer to an interview question. Score 0-100 and give 1-2 sentences of specific feedback.

Question: "${_INTERVIEW_QUESTIONS[questionIndex]}"

Answer: "${transcript.slice(0, 2000)}"

Return ONLY valid JSON: {"score": 85, "feedback": "Strong answer with a specific example. Could be more concise."}`
				}],
			});
			const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
			const match = text.match(/\{[\s\S]*\}/);
			if (match) {
				const parsed = JSON.parse(match[0]);
				score = parsed.score ?? null;
				feedback = parsed.feedback ?? null;
			}
		} catch (e) {
			console.error('[interview score]', e);
		}
	}

	const { data, error: e } = await supabaseAdmin
		.from('rep_interview_answers')
		.upsert({
			user_id: user.id,
			question_index: questionIndex,
			question_text: _INTERVIEW_QUESTIONS[questionIndex],
			recording_url: recordingUrl ?? null,
			transcript: transcript ?? null,
			score,
			feedback,
		}, { onConflict: 'user_id,question_index' })
		.select().single();

	if (e) throw error(400, e.message);

	// Check if all questions answered — compute overall score and unlock profile
	const { data: allAnswers } = await supabaseAdmin
		.from('rep_interview_answers')
		.select('score')
		.eq('user_id', user.id);

	if (allAnswers && allAnswers.length === _INTERVIEW_QUESTIONS.length) {
		const scored = allAnswers.filter(a => a.score !== null);
		if (scored.length > 0) {
			const overallScore = Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length);
			await supabaseAdmin.from('rep_profiles').upsert({
				user_id: user.id,
				interview_score: overallScore,
				interview_completed_at: new Date().toISOString(),
				roleplay_unlocked: overallScore >= 70, // unlock live roleplay if score ≥ 70
			}, { onConflict: 'user_id' });
		}
	}

	return json({ ...data, score, feedback });
};
