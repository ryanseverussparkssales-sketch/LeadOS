import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { isAccountSuspended } from '$lib/server/audit';
import type { RequestHandler } from './$types';

/**
 * GET /api/account/state — lightweight account gate checked by the app shell on load.
 * Returns whether the caller's account (or their agency owner) is suspended so the
 * layout can sign them out. Fails open in isAccountSuspended so a hiccup never locks
 * the platform out.
 */
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const suspended = await isAccountSuspended(user.id);
	return json({ suspended });
};
