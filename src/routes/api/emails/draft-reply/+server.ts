import { json } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

export const POST = async ({ request }) => {
    const user = await requireAuth(request);
    await assertAiAccess(user.id);
    const ownerId = await getEffectiveUserId(user.id);
    const { threadId, contactId, inboundBody, inboundSubject } = await request.json();

    let contactContext = '';
    if (contactId) {
        const { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('name, company, contact_type, notes, email')
            .eq('id', contactId)
            .single();

        const { data: recentCalls } = await supabaseAdmin
            .from('calls')
            .select('outcome, summary')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .limit(2);

        if (contact) {
            contactContext = `Contact: ${contact.name} at ${contact.company} (${contact.contact_type})`;
            if (recentCalls?.length) {
                contactContext += `\nLast calls: ${recentCalls.map(c => `${c.outcome}${c.summary ? ` - "${c.summary.slice(0,60)}"` : ''}`).join('; ')}`;
            }
        }
    }

    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'You are a sales rep drafting an email reply. Be concise, warm, and professional. Reference the email content. End with a clear next step.',
        messages: [{
            role: 'user',
            content: `${contactContext ? contactContext + '\n\n' : ''}They wrote (subject: ${inboundSubject}):\n"${inboundBody?.slice(0, 600)}"\n\nDraft a reply. Return ONLY the email body text, no subject line, no explanation.`
        }]
    });

    const draft = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    const subject = `Re: ${inboundSubject ?? ''}`;
    return json({ draft, subject });
};
