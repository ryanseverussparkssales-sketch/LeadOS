import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

// GET: fetch saved supercut clips
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('rep_supercut_clips')
		.select('*, call:calls(id, recording_url, call_duration_seconds, created_at)')
		.eq('user_id', user.id)
		.order('display_order', { ascending: true })
		.order('created_at', { ascending: false })
		.limit(20);
	return json(data ?? []);
};

// DELETE: remove a clip
export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'id required' }, { status: 400 });
	await supabaseAdmin.from('rep_supercut_clips').delete().eq('id', id).eq('user_id', user.id);
	return json({ ok: true });
};

// PATCH: feature/unfeature a clip or update display_order
export const PATCH: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'id required' }, { status: 400 });
	const body = await request.json();
	await supabaseAdmin.from('rep_supercut_clips')
		.update({ is_featured: body.is_featured, display_order: body.display_order })
		.eq('id', id).eq('user_id', user.id);
	return json({ ok: true });
};

// POST: generate supercut by mining transcripts
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	// Fetch recent calls with transcripts and recordings
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id, recording_url, raw_transcript, summary, outcome, call_duration_seconds, created_at')
		.eq('user_id', user.id)
		.not('raw_transcript', 'is', null)
		.not('recording_url', 'is', null)
		.order('created_at', { ascending: false })
		.limit(30);

	if (!calls?.length) return json({ clips: [], message: 'No recorded calls with transcripts yet' });

	await assertAiAccess(user.id);
	const { env } = await import('$env/dynamic/private');
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const clips: any[] = [];

	// Analyze each call for highlight moments
	for (const call of calls.slice(0, 10)) {
		if (!call.raw_transcript || call.call_duration_seconds < 30) continue;
		try {
			const msg = await anthropic.messages.create({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 600,
				messages: [{
					role: 'user',
					content: `Analyze this sales call transcript and identify up to 2 highlight moments suitable for a rep's portfolio supercut.

Call outcome: ${call.outcome ?? 'unknown'}
Duration: ${call.call_duration_seconds}s

Transcript (excerpt):
${call.raw_transcript.slice(0, 3000)}

Identify moments that show:
- opener: strong cold open in first 60 seconds
- objection: rep handling a pushback well
- genuine: a natural, human moment that shows personality/skill

Return ONLY valid JSON array (empty if no strong moments):
[{"clip_type": "opener|objection|genuine", "transcript_excerpt": "...", "ai_reason": "why this clip is strong", "display_order": 0}]
`
				}]
			});
			const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
			const callClips = JSON.parse(text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim());
			clips.push(...callClips.map((c: any, i: number) => ({
				user_id: user.id,
				call_id: call.id,
				clip_type: c.clip_type,
				transcript_excerpt: c.transcript_excerpt,
				ai_reason: c.ai_reason,
				display_order: clips.length + i,
				is_featured: false,
			})));
		} catch (e) { console.error('[supercut call]', e); }
	}

	await supabaseAdmin.from('rep_supercut_clips').delete().eq('user_id', user.id);
	if (clips.length) await supabaseAdmin.from('rep_supercut_clips').insert(clips);
	return json({ generated: clips.length });
};
