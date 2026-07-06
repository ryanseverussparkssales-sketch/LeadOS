/**
 * DB-backed rate limiter using Supabase.
 *
 * The in-memory Map approach is non-functional on Vercel serverless — every
 * invocation is a fresh process, so the counter resets to zero on every
 * request. This version uses a rate_limit_counters table with an atomic
 * increment_rate_limit RPC so all serverless instances share state.
 *
 * SQL migration: supabase-rate-limiting.sql (run once in Supabase SQL editor)
 *
 * Usage:
 *   import { rateLimitUser } from '$lib/server/rateLimit';
 *   const blocked = await rateLimitUser(userId, { max: 20, windowMs: 60_000 });
 *   if (blocked) throw error(429, 'Too many requests');
 */

import { supabaseAdmin } from './supabase';

export interface RateLimitOptions {
	max: number;       // requests allowed per window
	windowMs: number;  // window length in ms
	keyFn?: (req: Request) => string;  // custom key extractor (unused in async path)
}

/**
 * Returns true if the user is OVER the limit (should be blocked),
 * false if under the limit (allow the request).
 * Fails open on any DB error so a hiccup never locks out users.
 */
export async function rateLimitUser(
	userId: string,
	options: { max: number; windowMs: number }
): Promise<boolean> {
	const windowKey = `${userId}:${Math.floor(Date.now() / options.windowMs)}`;

	try {
		// Admin override: account_overrides.rate_limit_multiplier scales the cap
		// (e.g. 2 = double the allowance for that tenant). Default 1. Non-fatal.
		let max = options.max;
		try {
			const { data: ov } = await supabaseAdmin
				.from('account_overrides').select('rate_limit_multiplier').eq('user_id', userId).maybeSingle();
			const mult = Number(ov?.rate_limit_multiplier);
			if (Number.isFinite(mult) && mult > 0) max = Math.max(1, Math.round(options.max * mult));
		} catch { /* no override table / row → use default */ }

		const { data, error } = await supabaseAdmin.rpc('increment_rate_limit', {
			p_key: windowKey,
			p_window_ms: options.windowMs,
			p_user_id: userId,
		});

		if (error) {
			// RPC not yet deployed — fail open so the app keeps working
			console.warn('[rateLimit] RPC not available, allowing request:', error.message);
			return false;
		}

		return (data ?? 0) > max;
	} catch {
		// On any error, allow the request (fail open)
		return false;
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Fixed-window in-memory limiter — for PUBLIC endpoints with no userId
// (e.g. token-authenticated webhooks), keyed by arbitrary string.
//
// SERVERLESS CAVEAT: state lives in this module's memory, which is per server
// instance. On Vercel each *warm* lambda keeps its own Map, so the effective
// ceiling is `limit × warm instances` and cold starts reset counters. That is
// acceptable for its purpose — best-effort throttling to damp abuse bursts —
// not a strict global quota (for that, use rateLimitUser's DB-backed path).
// ────────────────────────────────────────────────────────────────────────────

type FixedWindow = { count: number; resetAt: number };

const windows = new Map<string, FixedWindow>();

/** Cap the map so a key-spraying attacker can't grow memory unbounded. */
const MAX_ENTRIES = 10_000;

/**
 * Count a hit against `key` in the current fixed window.
 *
 * @param key      Bucket identifier, e.g. `wh:${token}:${ip}`.
 * @param limit    Max requests allowed per window.
 * @param windowMs Window length in milliseconds.
 * @returns `{ ok: true }` when under the limit; `{ ok: false, retryAfterSeconds }`
 *          when over (retryAfterSeconds = time until the window resets, min 1).
 */
export function rateLimit(
	key: string,
	limit: number,
	windowMs: number,
): { ok: boolean; retryAfterSeconds?: number } {
	const now = Date.now();
	let win = windows.get(key);

	if (!win || win.resetAt <= now) {
		// Starting a fresh window. If the map is at capacity, lazily clean up:
		// drop expired windows first, then evict oldest (Map preserves insertion
		// order, so the front of the iterator is the oldest entry).
		if (!windows.has(key) && windows.size >= MAX_ENTRIES) {
			for (const [k, v] of windows) {
				if (v.resetAt <= now) windows.delete(k);
			}
			while (windows.size >= MAX_ENTRIES) {
				const oldest = windows.keys().next();
				if (oldest.done) break;
				windows.delete(oldest.value);
			}
		}
		win = { count: 0, resetAt: now + windowMs };
		windows.set(key, win);
	}

	win.count += 1;
	if (win.count > limit) {
		return {
			ok: false,
			retryAfterSeconds: Math.max(1, Math.ceil((win.resetAt - now) / 1000)),
		};
	}
	return { ok: true };
}
