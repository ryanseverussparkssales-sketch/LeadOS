import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { isSuperAdmin } from '$lib/server/superadmin';
import type { RequestHandler } from './$types';

// Non-throwing — every authenticated user calls this so the client can decide
// whether to show super-admin UI. Returns superAdmin:false for normal users.
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const realId = (user as any).real_id ?? user.id;
	return json({
		superAdmin: isSuperAdmin(realId),
		impersonating: (user as any).impersonating ?? false,
		asOwnerId: (user as any).impersonating ? user.id : null,
		realUserId: realId,
	});
};
