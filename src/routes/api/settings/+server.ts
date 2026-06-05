import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { encryptValue, decryptValue } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

const SENSITIVE_FIELDS = ['smtp_pass_encrypted', 'twilio_auth_token', 'twilio_api_key_secret'];

// Decrypt tolerantly — historical values may be stored as plaintext.
function safeDecrypt(v: unknown): string {
	if (!v || typeof v !== 'string') return v as string;
	try {
		return decryptValue(v);
	} catch {
		return v;
	}
}

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();

	if (!data) {
		return json({ company_name: '', company_email: '', hourly_rate: 150, currency: 'USD', timezone: 'America/Chicago', auto_record_calls: true, auto_transcribe_calls: true });
	}

	const result: Record<string, unknown> = { ...data };
	for (const field of SENSITIVE_FIELDS) {
		if (result[field]) result[field] = safeDecrypt(result[field]);
	}
	return json(result);
};

export const PUT: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const sanitized: Record<string, unknown> = { ...body };
	delete sanitized.id;

	// Encrypt sensitive fields before storing
	for (const field of SENSITIVE_FIELDS) {
		if (sanitized[field] && typeof sanitized[field] === 'string' && (sanitized[field] as string).trim()) {
			sanitized[field] = encryptValue(sanitized[field] as string);
		}
	}

	const { data, error } = await supabaseAdmin
		.from('user_settings')
		.upsert({ ...sanitized, user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
		.select().single();

	if (error) return json({ error: error.message }, { status: 400 });

	// Decrypt for client response
	const result: Record<string, unknown> = { ...data };
	for (const field of SENSITIVE_FIELDS) {
		if (result[field]) result[field] = safeDecrypt(result[field]);
	}
	return json(result);
};
