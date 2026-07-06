/**
 * Rate limiting — src/lib/server/rateLimit.ts
 *
 * Covers the in-memory fixed-window rateLimit() (used by the public webhook
 * and booking endpoints) and the DB-backed rateLimitUser() fail-open behavior.
 *
 * NOTE: rateLimit() keeps state in a module-level Map, so every test uses its
 * own unique key(s) to stay independent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$lib/server/supabase', async () => {
	const { createSupabaseMock } = await import('./helpers/supabaseMock');
	const mock = createSupabaseMock();
	return { supabaseAdmin: mock.supabaseAdmin, __mock: mock };
});

import { rateLimit, rateLimitUser } from '$lib/server/rateLimit';
import type { SupabaseMock } from './helpers/supabaseMock';

const sb = ((await import('$lib/server/supabase')) as any).__mock as SupabaseMock;

let keySeq = 0;
const uniqueKey = () => `test-key-${Date.now()}-${keySeq++}`;

afterEach(() => {
	vi.useRealTimers();
	sb.reset();
});

describe('rateLimit (fixed window, in-memory)', () => {
	it('allows exactly `limit` requests then blocks the next', () => {
		const key = uniqueKey();
		for (let i = 0; i < 5; i++) {
			expect(rateLimit(key, 5, 60_000)).toEqual({ ok: true });
		}
		const blocked = rateLimit(key, 5, 60_000);
		expect(blocked.ok).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
	});

	it('retryAfterSeconds reflects time remaining in the window (ceil, min 1)', () => {
		vi.useFakeTimers({ now: new Date('2026-07-04T12:00:00Z') });
		const key = uniqueKey();

		rateLimit(key, 1, 60_000); // opens the window
		expect(rateLimit(key, 1, 60_000).retryAfterSeconds).toBe(60);

		vi.advanceTimersByTime(30_500); // 29 500 ms left → ceil = 30
		expect(rateLimit(key, 1, 60_000).retryAfterSeconds).toBe(30);

		vi.advanceTimersByTime(29_400); // 100 ms left → clamped to 1
		expect(rateLimit(key, 1, 60_000).retryAfterSeconds).toBe(1);
	});

	it('resets the counter when the window elapses', () => {
		vi.useFakeTimers({ now: new Date('2026-07-04T12:00:00Z') });
		const key = uniqueKey();

		rateLimit(key, 1, 60_000);
		expect(rateLimit(key, 1, 60_000).ok).toBe(false);

		vi.advanceTimersByTime(60_001);
		expect(rateLimit(key, 1, 60_000)).toEqual({ ok: true });
		expect(rateLimit(key, 1, 60_000).ok).toBe(false); // fresh window counts again
	});

	it('separate keys have independent counters', () => {
		const a = uniqueKey();
		const b = uniqueKey();
		rateLimit(a, 1, 60_000);
		expect(rateLimit(a, 1, 60_000).ok).toBe(false);
		expect(rateLimit(b, 1, 60_000).ok).toBe(true);
	});

	it('eviction cap: spraying > MAX_ENTRIES distinct keys never throws and still limits', () => {
		vi.useFakeTimers({ now: new Date('2026-07-04T12:00:00Z') });
		const prefix = uniqueKey();
		expect(() => {
			for (let i = 0; i < 10_100; i++) rateLimit(`${prefix}:${i}`, 3, 60_000);
		}).not.toThrow();

		// Newest key still enforces its own limit after evictions.
		const key = `${prefix}:fresh`;
		rateLimit(key, 1, 60_000);
		expect(rateLimit(key, 1, 60_000).ok).toBe(false);
	});
});

describe('rateLimitUser (DB-backed)', () => {
	it('returns false (allow) when the RPC count is at or under the max', async () => {
		sb.queue('account_overrides', { data: null });
		sb.supabaseAdmin.rpc.mockResolvedValueOnce({ data: 10, error: null });
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(false);
	});

	it('returns true (block) when the RPC count exceeds the max', async () => {
		sb.queue('account_overrides', { data: null });
		sb.supabaseAdmin.rpc.mockResolvedValueOnce({ data: 11, error: null });
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(true);
	});

	it('fails open when the RPC reports an error (e.g. migration not deployed)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		sb.queue('account_overrides', { data: null });
		sb.supabaseAdmin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'missing rpc' } });
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(false);
		warn.mockRestore();
	});

	it('fails open when the client throws entirely', async () => {
		sb.supabaseAdmin.from.mockImplementationOnce(() => {
			throw new Error('network down');
		});
		sb.supabaseAdmin.rpc.mockRejectedValueOnce(new Error('network down'));
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(false);
	});

	it('applies the account rate_limit_multiplier override to the cap', async () => {
		// multiplier 2 → effective max 20: count 15 allowed, count 21 blocked.
		sb.queue('account_overrides', { data: { rate_limit_multiplier: 2 } });
		sb.supabaseAdmin.rpc.mockResolvedValueOnce({ data: 15, error: null });
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(false);

		sb.queue('account_overrides', { data: { rate_limit_multiplier: 2 } });
		sb.supabaseAdmin.rpc.mockResolvedValueOnce({ data: 21, error: null });
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(true);
	});

	it('ignores non-finite or non-positive multipliers', async () => {
		sb.queue('account_overrides', { data: { rate_limit_multiplier: -5 } });
		sb.supabaseAdmin.rpc.mockResolvedValueOnce({ data: 11, error: null });
		expect(await rateLimitUser('u1', { max: 10, windowMs: 60_000 })).toBe(true);
	});
});
