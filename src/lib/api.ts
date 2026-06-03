import { supabase } from '$lib/services/auth';

/**
 * Wraps fetch with the user's Supabase auth token.
 *
 * Behaviour on 401:
 *  1. Attempt a token refresh via supabase.auth.refreshSession().
 *  2. Retry the original request once with the new token.
 *  3. If the retry still gets a 401, return that response to the caller —
 *     do NOT redirect or call signOut(). Callers decide what to do with it.
 *
 * This prevents transient token-expiry errors from logging the user out.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const buildHeaders = (token: string | null): HeadersInit => {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (token) headers['Authorization'] = `Bearer ${token}`;
		return headers;
	};

	try {
		const { data: { session } } = await supabase.auth.getSession();
		const token = session?.access_token ?? null;

		const response = await fetch(url, {
			...options,
			headers: { ...buildHeaders(token), ...(options.headers ?? {}) },
		});

		// 401 → try refreshing once
		if (response.status === 401) {
			const { data: refreshData } = await supabase.auth.refreshSession();
			const newToken = refreshData.session?.access_token ?? null;
			return fetch(url, {
				...options,
				headers: { ...buildHeaders(newToken), ...(options.headers ?? {}) },
			});
		}

		return response;
	} catch (err) {
		console.error('[apiFetch] network error:', err);
		throw err;
	}
}
