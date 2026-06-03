import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

export const POST = async ({ request }) => {
    const user = await requireAuth(request);
    const ownerId = await getEffectiveUserId(user.id);
    const { threadId, contactId, lastMessages } = await request.json();

    // Get contact context
    let contactContext = '';
    if (contactId) {
        const { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('name, company, contact_type, notes')
            .eq('id', contactId)
            .single();

        const { data: recentCalls } = await supabaseAdmin
            .from('calls')
            .select('outcome, summary, created_at')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .limit(3);

        if (contact) {
            contactContext = `Contact: ${contact.name} at ${contact.company ?? 'unknown company'} (${contact.contact_type})`;
            if (contact.notes) contactContext += `\nNotes: ${contact.notes.slice(0, 200)}`;
            if (recentCalls?.length) {
                contactContext += `\nRecent calls: ${recentCalls.map(c => `${c.outcome}${c.summary ? ` - "${c.summary.slice(0, 80)}"` : ''}`).join('; ')}`;
            }
        }
    }

    const conversationHistory = (lastMessages ?? [])
        .map((m: any) => `${m.direction === 'outbound' ? 'You' : 'Them'}: ${m.body}`)
        .join('\n');

    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    
    const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: 'You are a sales rep drafting a concise, warm SMS reply. Keep it under 160 characters when possible. Sound natural, not corporate. Reference the conversation context.',
        messages: [{
            role: 'user',
            content: `${contactContext ? contactContext + '\n\n' : ''}Recent conversation:\n${conversationHistory}\n\nDraft a short, natural reply to continue this conversation. Return ONLY the message text, no quotes or explanation.`
        }]
    });

    const draft = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    return json({ draft });
};
