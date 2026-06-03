import { json, error } from '@sveltejs/kit';
import { rateLimitUser } from '$lib/server/rateLimit';
import { requireAuth } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	if (await rateLimitUser(user.id, { max: 30, windowMs: 60_000 })) throw error(429, "Rate limit exceeded — max 30 AI requests/minute");
	void user;

	const { type, platform, clientName, campaignName, product, tone, audience, extraContext } = await request.json();

	const platformGuide: Record<string, string> = {
		instagram: 'Instagram (max 2200 chars, emojis welcome, 3-5 hashtags)',
		facebook: 'Facebook (conversational, can be longer, 1-2 hashtags)',
		linkedin: 'LinkedIn (professional tone, thought leadership, limited hashtags)',
		twitter: 'Twitter/X (max 280 chars, punchy, 1-2 hashtags)',
		tiktok: 'TikTok (casual, Gen-Z friendly, trending hashtags)',
		google: 'Google Ads (headlines max 30 chars, description max 90 chars)',
		general: 'general social media post',
	};

	const toneMap: Record<string, string> = {
		professional: 'professional and polished',
		casual: 'casual and friendly',
		urgent: 'urgent and action-driven',
		inspiring: 'inspiring and motivational',
		humorous: 'light and humorous',
		authoritative: 'authoritative and credible',
	};

	const systemPrompt = `You are an expert marketing copywriter specializing in sales and B2B marketing.
Write compelling, platform-optimized copy that drives engagement and action.
Keep it authentic and avoid generic corporate-speak.`;

	let userPrompt = '';

	if (type === 'post') {
		userPrompt = `Write a ${platformGuide[platform] ?? 'social media'} post with a ${toneMap[tone] ?? 'professional'} tone.
${clientName ? `Client/Brand: ${clientName}` : 'For my sales consulting business'}
${campaignName ? `Campaign: ${campaignName}` : ''}
${product ? `Product/Service: ${product}` : ''}
${audience ? `Target audience: ${audience}` : ''}
${extraContext ? `Additional context: ${extraContext}` : ''}

Provide:
1. The post caption
2. 5 relevant hashtags
3. A call-to-action

Format as JSON: { "caption": "...", "hashtags": "...", "cta": "..." }`;
	} else if (type === 'ad_headline') {
		userPrompt = `Write 5 ad headlines for Google Ads (max 30 characters each).
${clientName ? `Brand: ${clientName}` : ''}
${product ? `Product/Service: ${product}` : ''}
${audience ? `Target audience: ${audience}` : ''}
${tone ? `Tone: ${toneMap[tone] ?? tone}` : ''}

Format as JSON: { "headlines": ["...","...","...","...","..."] }`;
	} else if (type === 'ad_description') {
		userPrompt = `Write 3 Google Ads descriptions (max 90 characters each).
${clientName ? `Brand: ${clientName}` : ''}
${product ? `Product/Service: ${product}` : ''}
${extraContext ? `USP/Offer: ${extraContext}` : ''}

Format as JSON: { "descriptions": ["...","...","..."] }`;
	} else if (type === 'email_subject') {
		userPrompt = `Write 5 compelling email subject lines for a marketing email.
${clientName ? `Brand: ${clientName}` : ''}
${product ? `Product/Service: ${product}` : ''}
${audience ? `Target audience: ${audience}` : ''}
${extraContext ? `Key angle: ${extraContext}` : ''}

Format as JSON: { "subjects": ["...","...","...","...","..."] }`;
	} else {
		throw error(400, 'Invalid type. Use: post | ad_headline | ad_description | email_subject');
	}

	const msg = await client.messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 800,
		system: systemPrompt,
		messages: [{ role: 'user', content: userPrompt }],
	});

	const text = msg.content[0].type === 'text' ? msg.content[0].text : '';

	// Try to extract JSON from response
	let parsed: unknown = null;
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (match) parsed = JSON.parse(match[0]);
	} catch {
		parsed = { raw: text };
	}

	return json({ result: parsed, raw: text });
};
