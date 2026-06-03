import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('login_activity').select('*')
		.eq('user_id', user.id)
		.order('login_at', { ascending: false })
		.limit(50);
	return json(data ?? []);
};

// POST: log a new login event (called from app layout on auth)
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { ipAddress, userAgent, deviceName } = await request.json().catch(() => ({}));
	await supabaseAdmin.from('login_activity').insert({
		user_id: user.id,
		ip_address: ipAddress ?? null,
		user_agent: userAgent ?? null,
		device_name: deviceName ?? null,
	});
	return json({ logged: true });
};
