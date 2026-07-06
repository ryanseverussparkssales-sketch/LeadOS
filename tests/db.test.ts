/**
 * Supabase write-result helpers — src/lib/server/db.ts
 * mustWrite (throwing) and logWrite (observability passthrough).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mustWrite, logWrite } from '$lib/server/db';

afterEach(() => vi.restoreAllMocks());

describe('mustWrite', () => {
	it('returns res.data unchanged on success', () => {
		const row = { id: 'x', value: 42 };
		expect(mustWrite<typeof row>('contacts insert')({ data: row, error: null })).toBe(row);
	});

	it('passes through null data on success (e.g. delete with no select)', () => {
		expect(mustWrite('contacts delete')({ data: null, error: null })).toBeNull();
	});

	it('logs and throws with the op name and DB message on error', () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() =>
			mustWrite('payout update')({ data: null, error: { message: 'row not found' } }),
		).toThrowError('payout update failed: row not found');
		expect(err).toHaveBeenCalledWith('[db] payout update failed:', 'row not found');
	});

	it('does not log on success', () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		mustWrite('noop')({ data: 1, error: null });
		expect(err).not.toHaveBeenCalled();
	});
});

describe('logWrite', () => {
	it('returns the exact result object unchanged on success', () => {
		const res = { data: { id: 1 }, error: null };
		expect(logWrite('op')(res)).toBe(res);
	});

	it('returns the exact result object unchanged on error, but logs it', () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = { data: null, error: { message: 'constraint violation' } };
		expect(logWrite('webhook contact insert')(res)).toBe(res); // same reference — never throws
		expect(err).toHaveBeenCalledWith('[db] webhook contact insert failed:', 'constraint violation');
	});

	it('slots into a promise chain without altering resolution', async () => {
		const res = { data: { id: 'a' }, error: null };
		const out = await Promise.resolve(res).then(logWrite('chained'));
		expect(out).toBe(res);
	});
});
