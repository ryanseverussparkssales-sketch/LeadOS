import { json } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST = async ({ request }) => {
    const user = await requireAuth(request);
    await assertAiAccess(user.id);
    if (await rateLimitUser(user.id, { max: 20, windowMs: 60_000 })) return json({ error: 'Too many requests' }, { status: 429 });
    const { text } = await request.json();
    if (!text?.trim()) return json({ error: 'No text' }, { status: 400 });

    try {
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            system: 'You are a sales professional\'s brainstorm assistant, embedded in a sales CRM called RogueOS.\nThe user may refer to contacts, companies, campaigns, or deals by name. Treat these as sales context.\nTake raw spoken notes and structure them into actionable output. Be concise. Return JSON only.',
            messages: [{
                role: 'user',
                content: `Process these spoken notes into structured output:

"${text.slice(0, 1500)}"

Return JSON:
{
  "summary": "<2 sentence summary of the key point>",
  "actionItems": ["<specific next action>", ...],
  "ideas": ["<idea or insight worth exploring>", ...],
  "followUps": ["<question or thing to check later>", ...]
}

Keep each item under 12 words. Max 4 items per array.`
            }]
        });
        const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}';
        let result;
        try { result = JSON.parse(text); } catch { result = { summary: text, actionItems: [], ideas: [], followUps: [] }; }
        return json(result);
    } catch (err) {
        console.error('[dictation/brainstorm]', err);
        return json({ error: 'AI service failed' }, { status: 500 });
    }
};
