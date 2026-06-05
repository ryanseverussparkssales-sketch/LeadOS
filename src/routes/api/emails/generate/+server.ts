import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { rateLimitUser } from '$lib/server/rateLimit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	if (await rateLimitUser(user.id, { max: 30, windowMs: 60_000 })) throw error(429, 'Rate limit exceeded — max 30 AI requests/minute');

	const {
		contactId, callId, emailType, customPrompt, summary, transcript,
		contactName, contactEmail, contactCompany, contactType, contactNotes,
		campaignName, campaignGoal, campaignWinLabel,
	} = await request.json();

	// Fetch recent call history if contactId given
	let recentCalls: { outcome: string; summary: string | null; created_at: string }[] = [];
	if (contactId) {
		const { data: calls } = await supabaseAdmin
			.from('calls')
			.select('outcome, summary, created_at')
			.eq('contact_id', contactId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.limit(3);
		if (calls) recentCalls = calls;
	}

	const callHistoryContext = recentCalls.length > 0
		? `\nRecent call history:\n${recentCalls.map(c =>
			`- ${new Date(c.created_at).toLocaleDateString()}: ${c.outcome}${c.summary ? ` — "${c.summary.slice(0, 150)}"` : ''}`
		  ).join('\n')}`
		: '';

	const systemPrompt = `You are a sales rep's writing assistant. Write concise, warm, first-person emails that feel human.
Keep emails under 150 words. End with a clear next step. Never use "I hope this email finds you well" or corporate filler.
Personalize to the contact's name, platform/company, and context.
Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

	const userContent = [
		`Contact: ${contactName ?? 'the contact'}${contactCompany ? ` at ${contactCompany}` : ''}`,
		contactType ? `Contact type: ${contactType}` : '',
		contactEmail ? `Email: ${contactEmail}` : '',
		contactNotes ? `Notes: ${contactNotes.slice(0, 300)}` : '',
		campaignName ? `Campaign: ${campaignName}` : '',
		campaignGoal ? `Goal: ${campaignGoal}` : '',
		campaignWinLabel ? `Win outcome: ${campaignWinLabel}` : '',
		callHistoryContext,
		summary ? `Most recent call summary: ${summary}` : '',
		transcript ? `Transcript excerpt: ${transcript.slice(0, 1500)}` : '',
		customPrompt ? `Additional instructions: ${customPrompt}` : '',
		`\nWrite a ${(emailType ?? 'intro').replace(/_/g, ' ')} email. Return JSON: { "subject": "...", "body": "..." }`,
	].filter(Boolean).join('\n');

	let subject = 'Follow-up';
	let body = '';

	try {
		const { env } = await import('$env/dynamic/private');
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
		const msg = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 600,
			system: systemPrompt,
			messages: [{ role: 'user', content: userContent }],
		});
		const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
		const match = text.match(/\{[\s\S]*\}/);
		if (match) {
			const parsed = JSON.parse(match[0]);
			subject = parsed.subject?.trim() ?? 'Follow-up';
			body = parsed.body?.trim() ?? '';
		}
	} catch (e) {
		console.error('[email generate]', e);
		throw error(500, 'AI generation failed');
	}
	return json({ success: true });
};
