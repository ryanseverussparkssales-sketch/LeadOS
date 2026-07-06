/**
 * Supabase write-result helpers — no write error goes unobserved.
 *
 * Supabase clients return `{ data, error }` instead of throwing, so a
 * destructure like `const { data } = await query` silently discards failures.
 * These helpers slot into the promise chain (query builders are thenables):
 *
 *   // Throwing — for writes where failure should abort the request:
 *   const row = mustWrite<Row>('contacts insert')(
 *     await supabaseAdmin.from('contacts').insert(payload).select().single()
 *   );
 *
 *   // Non-throwing — for carefully sequenced logic where existing behavior
 *   // must be preserved; just surfaces the error in the logs:
 *   const { data } = await supabaseAdmin.from('payouts').update(u).eq('id', id)
 *     .select().single().then(logWrite('payout update'));
 */

type WriteResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Throwing variant: logs + throws on a Supabase error, otherwise returns
 * `res.data` unchanged. Use on write paths where a failed write should fail
 * the request (an uncaught throw becomes a 500 via SvelteKit's handleError).
 */
export function mustWrite<T>(op: string) {
	return (res: WriteResult<T>): T | null => {
		if (res.error) {
			console.error(`[db] ${op} failed:`, res.error.message);
			throw new Error(`${op} failed: ${res.error.message}`);
		}
		return res.data;
	};
}

/**
 * Non-throwing variant: logs the error (if any) and returns the result
 * object unchanged, so it can be dropped into existing `.then()` chains
 * without altering success OR failure behavior — observability only.
 */
export function logWrite(op: string) {
	return <R extends { error: { message: string } | null }>(res: R): R => {
		if (res.error) {
			console.error(`[db] ${op} failed:`, res.error.message);
		}
		return res;
	};
}
