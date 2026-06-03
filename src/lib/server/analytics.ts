import { supabaseAdmin } from './supabase';

// Pricing constants (approximate)
export const PRICING = {
	twilio: 0.014,           // $ per minute (outbound US)
	groq: 0.00005,           // $ per transcription request
	claudeInput: 0.0008,     // $ per 1k input tokens (Haiku)
	claudeOutput: 0.004,     // $ per 1k output tokens (Haiku)
};

export function calcTwilioCost(durationSec: number): number {
	return Math.ceil(durationSec / 60) * PRICING.twilio;
}

export function calcGroqCost(hasTranscript: boolean): number {
	return hasTranscript ? PRICING.groq : 0;
}

export function calcClaudeCost(inputTokens: number, outputTokens: number): number {
	return (inputTokens / 1000) * PRICING.claudeInput + (outputTokens / 1000) * PRICING.claudeOutput;
}

export async function logCallCost(
	userId: string,
	callId: string,
	durationSec: number,
	hasTranscript: boolean,
	claudeInputTokens = 150,   // approximate for a call summary prompt
	claudeOutputTokens = 100
): Promise<void> {
	const twilioCost = calcTwilioCost(durationSec);
	const groqCost   = calcGroqCost(hasTranscript);
	const claudeCost = hasTranscript ? calcClaudeCost(claudeInputTokens, claudeOutputTokens) : 0;
	const total      = twilioCost + groqCost + claudeCost;

	await supabaseAdmin.from('api_usage_log').insert({
		user_id: userId,
		call_id: callId,
		twilio_duration_minutes: Math.ceil(durationSec / 60),
		twilio_cost: twilioCost,
		groq_cost: groqCost,
		claude_input_tokens: hasTranscript ? claudeInputTokens : 0,
		claude_output_tokens: hasTranscript ? claudeOutputTokens : 0,
		claude_cost: claudeCost,
		total_cost: total,
	});
}
