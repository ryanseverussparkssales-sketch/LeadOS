/**
 * Run background work durably from a webhook handler.
 *
 * On serverless (Vercel) the function instance is frozen the moment the HTTP
 * response is returned, so a fire-and-forget `(async () => {...})()` is routinely
 * killed mid-write — which is why Twilio status/recording callbacks were silently
 * dropping their DB updates. This bridges that: if the platform exposes
 * `waitUntil` (Vercel keeps the instance alive until the promise settles) we hand
 * the work off and respond immediately; otherwise we simply await it so the write
 * is guaranteed to complete before we respond.
 */
type WaitUntilCtx = { waitUntil?: (p: Promise<unknown>) => void };

function getPlatformContext(): WaitUntilCtx | null {
	try {
		// Vercel's Node runtime exposes the per-request context under this symbol.
		const store = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
			| { get?: () => WaitUntilCtx }
			| undefined;
		const ctx = store?.get?.();
		return ctx ?? null;
	} catch {
		return null;
	}
}

export async function runDurable(work: Promise<unknown>): Promise<void> {
	const tracked = Promise.resolve(work).catch((e) => console.error('[durable] task failed:', e));
	const ctx = getPlatformContext();
	if (ctx?.waitUntil) {
		ctx.waitUntil(tracked); // keep the instance alive in the background, respond now
		return;
	}
	await tracked; // no background primitive — finish before responding so the write survives
}
