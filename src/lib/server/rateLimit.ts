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

		return (data ?? 0) > options.max;
	} catch {
		// On any error, allow the request (fail open)
		return false;
	}
}

/**
 * Sync stub kept for backward compatibility with any call-sites that haven't
 * migrated yet. Always allows — non-functional on serverless. Migrate those
 * call-sites to the async rateLimitUser() above.
 */
export function rateLimit(
	_request: Request,
	_opts: RateLimitOptions
): boolean {
	return true; // always allow — use rateLimitUser() instead
}
