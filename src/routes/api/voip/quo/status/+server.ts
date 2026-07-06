import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAuth } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * GET /api/voip/quo/status
 *
 * Cheap connection status for the Quo / OpenPhone settings card. Returns ONLY
 * booleans — never the secret values themselves.
 *
 * {
 *   configured:    boolean,  // QUO_API_KEY && QUO_PHONE_NUMBER_ID both set
 *   webhookSecret: boolean,  // QUO_WEBHOOK_SECRET set
 * }
 */
export const GET: RequestHandler = async ({ request }) => {
	await requireAuth(request);

	const hasApiKey = !!(env.QUO_API_KEY ?? '').trim();
	const hasPhoneId = !!(env.QUO_PHONE_NUMBER_ID ?? '').trim();
	const hasWebhookSecret = !!(env.QUO_WEBHOOK_SECRET ?? '').trim();

	return json({
		configured: hasApiKey && hasPhoneId,
		webhookSecret: hasWebhookSecret,
	});
};
