import Anthropic from '@anthropic-ai/sdk';
import { assertAiAccess } from '$lib/server/tier';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	if (await rateLimitUser(user.id, { max: 10, windowMs: 60_000 })) throw error(429, 'Rate limit exceeded — max 10 script generations/minute');
	const { product, persona, keyBenefits, commonObjections, tone, campaignName, additionalContext } = await request.json();

	if (!product || !persona) throw error(400, 'product and persona required');

	const prompt = `You are an expert sales script writer who has written scripts for hundreds of top-performing sales teams.

Create a complete, natural-sounding cold calling playbook for:

Product/Service: ${product}
Target Persona: ${persona}
Key Benefits: ${keyBenefits ?? 'Not specified'}
Common Objections: ${commonObjections ?? 'Price, timing, already have a solution'}
Tone: ${tone ?? 'Professional but warm'}
Campaign: ${campaignName ?? 'General outreach'}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Return ONLY valid JSON with this exact structure:
{
  "title": "Script name based on product and persona",
  "opener": "REQUIRED: Begin with 'Hey [name], this is [your name] with Edelhaus — quick heads up, this call is being recorded for training purposes.' Then 1-2 natural sentences with a pattern interrupt.",
  "elevatorPitch": "30-second pitch if they ask who you are/what you do. Outcome-focused.",
  "discovery": "3-4 open-ended discovery questions to understand their situation and pain.",
  "closing": "How to close the call — book meeting, send info, or get callback. Specific language.",
  "objections": [
    {
      "objection": "Exact phrasing of common objection",
      "response": "Your response — acknowledge, pivot, re-engage. Natural language.",
      "followUp": "What you say next to move the conversation forward"
    }
  ]
}

Generate 5-7 objections covering: price, timing, already have solution, send me info, not interested, gatekeeper, wrong person.
Make the language conversational and human. Avoid corporate buzzwords.`;

	const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const stream = await client.messages.stream({
		model: 'claude-sonnet-4-6',
		max_tokens: 3000,
		messages: [{ role: 'user', content: prompt }],
	});

	let fullText = '';
	for await (const chunk of stream) {
		if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
			fullText += chunk.delta.text;
		}
	}

	try {
		const clean = fullText.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
		const parsed = JSON.parse(clean);
		return json(parsed);
	} catch {
		return json({ error: 'Failed to parse script JSON', raw: fullText }, { status: 500 });
	}
};
