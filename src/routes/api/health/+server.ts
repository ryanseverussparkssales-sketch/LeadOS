import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const start = Date.now();
	let dbStatus = 'ok';
	let dbLatency = 0;

	try {
		const t = Date.now();
		await supabaseAdmin.from('contacts').select('id').limit(1);
		dbLatency = Date.now() - t;
	} catch {
		dbStatus = 'error';
	}

	return json({
		status: dbStatus === 'ok' ? 'healthy' : 'degraded',
		version: '1.0.0',
		timestamp: new Date().toISOString(),
		uptime: process.uptime ? Math.round(process.uptime()) : null,
		database: { status: dbStatus, latencyMs: dbLatency },
		responseMs: Date.now() - start,
	}, {
		headers: { 'Cache-Control': 'no-store' },
		status: dbStatus === 'ok' ? 200 : 503,
	});
};
