import { supabaseAdmin } from './supabase';

// Approximate prices ($ per 1k tokens). Keep keys aligned with the model strings
// actually used in the code. Update when Anthropic pricing changes.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	'claude-haiku-4-5':          { input: 0.0008, output: 0.004 },
	'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
	'claude-sonnet-4-5':         { input: 0.003,  output: 0.015 },
	'claude-sonnet-4-6':         { input: 0.003,  output: 0.015 },
	'claude-opus-4-6':           { input: 0.015,  output: 0.075 },
};
const DEFAULT_PRICE = { input: 0.0008, output: 0.004 }; // fall back to Haiku rates

export const PRICING = {
	twilio: 0.014,   // $ per minute (outbound US)
	groq: 0.00005,   // $ per transcription request
	// Legacy flat fields kept for the /api/analytics payload shape; per-model
	// pricing now lives in MODEL_PRICING. These mirror the Haiku reference rates.
	claudeInput: 0.0008,
	claudeOutput: 0.004,
};

export function calcTwilioCost(durationSec: number): number {
	return Math.ceil(durationSec / 60) * PRICING.twilio;
}

export function calcGroqCost(hasTranscript: boolean): number {
	return hasTranscript ? PRICING.groq : 0;
}

export function calcClaudeCost(model: string, inputTokens: number, outputTokens: number): number {
	const p = MODEL_PRICING[model] ?? DEFAULT_PRICE;
	return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

/**
 * Log REAL AI usage from an Anthropic response's `usage` block. Use everywhere a
 * Claude call is made so per-tenant AI spend is accurate (not estimated). `callId`
 * is optional — pass it for call-related AI, omit for chat/draft/score/etc.
 * Non-fatal: never let cost logging break the feature.
 */
export async function logAiUsage(args: {
	userId: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	source: string;        // e.g. 'call_summary', 'assistant_chat', 'email_draft'
	callId?: string | null;
}): Promise<void> {
	try {
		const cost = calcClaudeCost(args.model, args.inputTokens, args.outputTokens);
		await supabaseAdmin.from('api_usage_log').insert({
			user_id: args.userId,
			call_id: args.callId ?? null,
			source: args.source,
			model: args.model,
			claude_input_tokens: args.inputTokens,
			claude_output_tokens: args.outputTokens,
			claude_cost: cost,
			total_cost: cost,
		});
	} catch (e) {
		console.error('[analytics] logAiUsage failed:', e instanceof Error ? e.message : e);
	}
}

/**
 * Log the carrier/transcription cost of a recorded call (Twilio minutes + Groq).
 * The Claude *summary* cost is logged separately with REAL tokens via logAiUsage
 * (source 'call_summary') — so this no longer estimates Claude tokens.
 */
export async function logCallCost(
	userId: string,
	callId: string,
	durationSec: number,
	hasTranscript: boolean
): Promise<void> {
	try {
		const twilioCost = calcTwilioCost(durationSec);
		const groqCost   = calcGroqCost(hasTranscript);
		await supabaseAdmin.from('api_usage_log').insert({
			user_id: userId,
			call_id: callId,
			source: 'call_media',
			twilio_duration_minutes: Math.ceil(durationSec / 60),
			twilio_cost: twilioCost,
			groq_cost: groqCost,
			claude_input_tokens: 0,
			claude_output_tokens: 0,
			claude_cost: 0,
			total_cost: twilioCost + groqCost,
		});
	} catch (e) {
		console.error('[analytics] logCallCost failed:', e instanceof Error ? e.message : e);
	}
}
