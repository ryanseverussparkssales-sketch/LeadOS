import { requireAuth } from '$lib/server/supabase';
import { assertAiAccess } from '$lib/server/tier';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const POST = async ({ request }) => {
    const user = await requireAuth(request);
    await assertAiAccess(user.id);
    const { messages, model = 'claude-sonnet-4-5' } = await request.json();

    if (!messages?.length) {
        return new Response('No messages', { status: 400 });
    }

    // Stream the response
    const stream = await anthropic.messages.stream({
        model,
        max_tokens: 2048,
        system: `You are Claude, a helpful AI assistant embedded in Edelhaus — a sales CRM. 
The user may ask you anything: writing help, research, brainstorming, explanations, code, math, creative work — anything.
Be direct and concise. Use markdown formatting when it helps readability (headers, bullets, code blocks).
Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
        messages: messages.slice(-30), // keep last 30 turns
    });

    const readable = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of stream) {
                    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                        controller.enqueue(new TextEncoder().encode(chunk.delta.text));
                    }
                }
            } catch (e) {
                controller.enqueue(new TextEncoder().encode('\n[Error: connection interrupted]'));
            } finally {
                controller.close();
            }
        }
    });

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Accel-Buffering': 'no',
        }
    });
};
