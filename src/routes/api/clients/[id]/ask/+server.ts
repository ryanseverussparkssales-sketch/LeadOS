import Anthropic from '@anthropic-ai/sdk';
import { error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { question, conversationHistory } = await request.json();
	if (!question?.trim()) throw error(400, 'question required');

	// Verify client belongs to user
	const { data: client } = await supabaseAdmin.from('clients').select('id, name').eq('id', params.id).eq('user_id', ownerId).single();
	if (!client) throw error(404, 'Client not found');

	// Gather context: knowledge base
	const { data: knowledge } = await supabaseAdmin.from('client_knowledge').select('title, content, knowledge_type').eq('client_id', params.id).order('sort_order').limit(20);

	// Recent calls with contacts at this client
	const { data: contacts } = await supabaseAdmin.from('contacts').select('id, name, title').eq('user_id', ownerId).ilike('company', `%${client.name}%`).limit(10);
	const contactIds = (contacts ?? []).map(c => c.id);

	let recentCalls: Array<{ outcome: string | null; summary: string | null; created_at: string; contact: { name: string } | null }> = [];
	if (contactIds.length) {
		const { data: calls } = await supabaseAdmin
			.from('calls')
			.select('outcome, summary, created_at, contact:contacts(name)')
			.in('contact_id', contactIds)
			.not('summary', 'is', null)
			.order('created_at', { ascending: false })
			.limit(10);
		recentCalls = (calls ?? []).map(c => ({
			outcome: c.outcome,
			summary: c.summary,
			created_at: c.created_at,
			contact: c.contact as unknown as { name: string } | null,
		}));
	}

	// Scripts assigned to this client
	const { data: scripts } = await supabaseAdmin.from('scripts').select('title, opener, elevator_pitch, discovery, closing').eq('client_id', params.id).limit(3);

	// Build system prompt with all context
	const knowledgeContext = (knowledge ?? []).map(k => `[${k.knowledge_type?.toUpperCase()}] ${k.title}:\n${k.content}`).join('\n\n');
	const callContext = recentCalls.map(c => `Call with ${c.contact?.name ?? 'contact'} (${c.outcome}): ${c.summary}`).join('\n');
	const scriptContext = (scripts ?? []).map(s => `Script "${s.title}": Opener: ${s.opener ?? 'N/A'} | Pitch: ${s.elevator_pitch ?? 'N/A'}`).join('\n');
	const contactContext = (contacts ?? []).map(c => `${c.name} — ${c.title}`).join(', ');

	const systemPrompt = `You are an AI sales assistant helping a sales rep prepare for and during calls with ${client.name}.

You have access to everything the team knows about this client. Answer questions concisely and practically — give the rep what they need, nothing extra.

KNOWLEDGE BASE FOR ${client.name.toUpperCase()}:
${knowledgeContext || 'No knowledge base entries yet.'}

RECENT CALL HISTORY:
${callContext || 'No calls on record yet.'}

CONTACTS AT ${client.name.toUpperCase()}:
${contactContext || 'No contacts on record.'}

ASSIGNED SCRIPTS:
${scriptContext || 'No scripts assigned to this client.'}

When answering:
- Be direct and actionable
- Reference specific knowledge base items when relevant
- Suggest talking points from the scripts when appropriate
- If you don't have enough information, say so clearly`;

	// Build messages array with conversation history
	const messages = [
		...(conversationHistory ?? []),
		{ role: 'user', content: question }
	] as Anthropic.MessageParam[];

	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const stream = await anthropic.messages.stream({
		model: 'claude-sonnet-4-6',
		max_tokens: 2000,
		system: systemPrompt,
		messages,
	});

	const readable = new ReadableStream({
		async start(controller) {
			try {
				for await (const chunk of stream) {
					if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
						controller.enqueue(new TextEncoder().encode(chunk.delta.text));
					}
				}
			} catch (err) {
				console.error('[clients/ask] stream error:', err);
				controller.enqueue(new TextEncoder().encode('\n__STREAM_ERROR__'));
			} finally {
				controller.close();
			}
		}
	});
	return new Response(readable, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};