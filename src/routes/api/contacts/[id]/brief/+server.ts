import { json } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
    const user = await requireAuth(request);
    await assertAiAccess(user.id);
    const ownerId = await getEffectiveUserId(user.id);

    const contactId = params.id;

    // Fetch contact + recent activity in parallel
    const [contactRes, callsRes, emailsRes, tasksRes] = await Promise.all([
        supabaseAdmin.from('contacts').select('name, company, title, contact_type, contact_score, notes, tags').eq('id', contactId).single(),
        supabaseAdmin.from('calls').select('outcome, summary, created_at, duration_seconds').eq('contact_id', contactId).eq('user_id', ownerId).order('created_at', { ascending: false }).limit(3),
        supabaseAdmin.from('email_logs').select('subject, direction, created_at').eq('contact_id', contactId).eq('user_id', ownerId).order('created_at', { ascending: false }).limit(3),
        supabaseAdmin.from('tasks').select('title, status, due_date').eq('contact_id', contactId).eq('user_id', ownerId).neq('status', 'completed').limit(3),
    ]);

    const contact = contactRes.data;
    const recentCalls = callsRes.data ?? [];
    const recentEmails = emailsRes.data ?? [];
    const openTasks = tasksRes.data ?? [];

    if (!contact) return json({ brief: null });

    // Build context for AI
    const hasHistory = recentCalls.length > 0 || recentEmails.length > 0;

    if (!hasHistory) {
        return json({
            brief: `First contact with ${contact.name ?? 'this person'}${contact.company ? ` at ${contact.company}` : ''}.${contact.notes ? ` Note: ${contact.notes.slice(0, 100)}` : ''}`,
            isAI: false,
            recentCalls,
            openTasks,
        });
    }

    // Generate AI brief
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const callSummary = recentCalls.map(c =>
        `${new Date(c.created_at).toLocaleDateString()}: ${c.outcome}${c.summary ? ` — "${c.summary.slice(0, 80)}"` : ''}`
    ).join('\n');

    const emailSummary = recentEmails.map(e =>
        `${e.direction === 'inbound' ? 'They emailed' : 'You emailed'}: "${e.subject}" (${new Date(e.created_at).toLocaleDateString()})`
    ).join('\n');

    const prompt = `Write a 2-sentence pre-call brief for a sales rep about to call this contact.

Contact: ${contact.name}${contact.company ? ` at ${contact.company}` : ''}${contact.title ? ` (${contact.title})` : ''}
Type: ${contact.contact_type}${contact.contact_score ? `, score: ${contact.contact_score}/100` : ''}
${contact.notes ? `Notes: ${contact.notes.slice(0, 150)}` : ''}

Recent calls:
${callSummary || 'None'}

Recent emails:
${emailSummary || 'None'}

Open tasks: ${openTasks.map(t => t.title).join(', ') || 'None'}

Write 2 short sentences: (1) where the relationship stands, (2) what to focus on this call. Max 40 words total. First person from the rep's perspective. Be specific.`;

    const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }]
    });

    const brief = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null;

    return json({ brief, isAI: true, recentCalls, openTasks });
};
