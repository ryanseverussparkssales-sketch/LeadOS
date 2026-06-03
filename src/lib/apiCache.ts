/**
 * Simple TTL cache for API responses.
 * Prevents the same GET endpoint from being called multiple times in rapid succession.
 */
const cache = new Map<string, { data: unknown; expires: number }>();
const inFlight = new Map<string, Promise<unknown>>();

export function clearCache(pattern?: string) {
	if (!pattern) { cache.clear(); return; }
	for (const key of cache.keys()) { if (key.includes(pattern)) cache.delete(key); }
}

export async function cachedFetch<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttlMs = 10_000
): Promise<T> {
	// Return cached value if still valid
	const hit = cache.get(key);
	if (hit && Date.now() < hit.expires) return hit.data as T;

	// Deduplicate in-flight requests
	if (inFlight.has(key)) return inFlight.get(key) as Promise<T>;

	const p = fetcher().then(data => {
		cache.set(key, { data, expires: Date.now() + ttlMs });
		inFlight.delete(key);
		return data;
	}).catch(err => { inFlight.delete(key); throw err; });

	inFlight.set(key, p);
	return p;
}
