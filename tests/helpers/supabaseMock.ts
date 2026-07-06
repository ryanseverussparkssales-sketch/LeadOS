/**
 * Chainable Supabase client mock for route/server-module tests.
 *
 * Every `from(table)` returns a Proxy that records each builder method call
 * (`select`, `eq`, `insert`, `update`, `limit`, `single`, ...) and is itself
 * awaitable ("thenable", like the real query builders). Awaiting a chain
 * resolves to the next queued `{ data, error }` result for that table
 * (FIFO per table, in chain-creation order); an empty queue resolves to
 * `{ data: null, error: null }`.
 *
 * Usage:
 *   const mock = createSupabaseMock();
 *   mock.queue('contacts', { data: { id: 'c-1' } });
 *   // ... exercise code that awaits supabaseAdmin.from('contacts')...
 *   expect(mock.opArgs('contacts', 'insert')?.[0]).toMatchObject({ ... });
 */
import { vi } from 'vitest';

export type QueryResult = { data: any; error: { message: string } | null };

export interface RecordedCall {
	table: string;
	ops: { method: string; args: any[] }[];
}

export interface SupabaseMock {
	supabaseAdmin: {
		from: ReturnType<typeof vi.fn>;
		rpc: ReturnType<typeof vi.fn>;
	};
	/** Queue the next result for a table (FIFO, consumed when a chain is awaited). */
	queue: (table: string, result: Partial<QueryResult>) => void;
	/** Every chain created via from(), with the builder methods called on it. */
	calls: RecordedCall[];
	/** args of the first `method` op recorded against `table` (any chain). */
	opArgs: (table: string, method: string) => any[] | undefined;
	reset: () => void;
}

export function createSupabaseMock(): SupabaseMock {
	const queues = new Map<string, QueryResult[]>();
	const calls: RecordedCall[] = [];

	const queue = (table: string, result: Partial<QueryResult>) => {
		const arr = queues.get(table) ?? [];
		arr.push({ data: null, error: null, ...result });
		queues.set(table, arr);
	};

	const takeResult = (table: string): QueryResult => {
		const arr = queues.get(table);
		return arr && arr.length ? arr.shift()! : { data: null, error: null };
	};

	function makeChain(table: string) {
		const record: RecordedCall = { table, ops: [] };
		calls.push(record);
		// Memoized so double-awaiting one chain consumes exactly one queue entry.
		let settled: Promise<QueryResult> | null = null;
		const settle = () => (settled ??= Promise.resolve(takeResult(table)));
		const chain: any = new Proxy(function () { /* proxy target */ }, {
			get(_target, prop) {
				if (typeof prop !== 'string') return undefined;
				if (prop === 'then') return (ok: any, err: any) => settle().then(ok, err);
				if (prop === 'catch') return (fn: any) => settle().catch(fn);
				if (prop === 'finally') return (fn: any) => settle().finally(fn);
				return (...args: any[]) => {
					record.ops.push({ method: prop, args });
					return chain;
				};
			},
		});
		return chain;
	}

	const supabaseAdmin = {
		from: vi.fn((table: string) => makeChain(table)),
		rpc: vi.fn(async () => ({ data: 0, error: null })),
	};

	const opArgs = (table: string, method: string): any[] | undefined => {
		for (const c of calls) {
			if (c.table !== table) continue;
			const op = c.ops.find((o) => o.method === method);
			if (op) return op.args;
		}
		return undefined;
	};

	const reset = () => {
		queues.clear();
		calls.length = 0;
		supabaseAdmin.from.mockClear();
		supabaseAdmin.rpc.mockClear();
		supabaseAdmin.rpc.mockImplementation(async () => ({ data: 0, error: null }));
	};

	return { supabaseAdmin, queue, calls, opArgs, reset };
}
