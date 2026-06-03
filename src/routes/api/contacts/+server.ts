import { json, error } from '@sveltejs/kit';
import { rateLimitUser } from '$lib/server/rateLimit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone, parseCSV } from '$lib/server/supabase';
import { runAutomations } from '$lib/server/automations';
import type { RequestHandler } from './$types';

const BATCH_SIZE = 500; // rows per bulk insert — safe Supabase limit

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	if (await rateLimitUser(user.id, { max: 5, windowMs: 300000 })) throw error(429, "Rate limit exceeded — slow down");
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();
	const { csv, call_list_id } = body;
	if (!csv) throw error(400, 'csv field required');

	const rows = parseCSV(csv);
	if (rows.length < 2) return json({ created: 0, duplicates: 0, errors: 0, contact_ids: [] });

	const headers  = rows[0].map((h: string) => h.toLowerCase().trim());
	const dataRows = rows.slice(1).filter((r: string[]) => r.some(c => c));

	const nameIdx    = headers.indexOf('name');
	const phoneIdx   = headers.indexOf('phone');
	const emailIdx   = headers.indexOf('email');
	const companyIdx = headers.indexOf('company');
	const titleIdx   = headers.indexOf('title');

	if (nameIdx === -1 || phoneIdx === -1) throw error(400, 'CSV must have name and phone columns');

	// ── 1. Normalise all rows, skip blanks ─────────────────────────────────────
	interface PreparedRow {
		name: string; rawPhone: string; phoneNorm: string;
		email: string | null; emailNorm: string | null;
		company: string | null; title: string | null;
	}
	const prepared: PreparedRow[] = [];
	for (const row of dataRows) {
		const name = row[nameIdx]?.trim();
		if (!name) continue;
		const rawPhone = row[phoneIdx]?.trim() ?? '';
		const phoneNorm = normalizePhone(rawPhone);
		if (!phoneNorm) continue;
		prepared.push({
			name, rawPhone, phoneNorm,
			email:     emailIdx   >= 0 ? row[emailIdx]?.trim()   || null : null,
			emailNorm: emailIdx   >= 0 ? row[emailIdx]?.trim().toLowerCase() || null : null,
			company:   companyIdx >= 0 ? row[companyIdx]?.trim() || null : null,
			title:     titleIdx   >= 0 ? row[titleIdx]?.trim()   || null : null,
		});
	}

	if (prepared.length === 0) return json({ created: 0, duplicates: 0, errors: 0, contact_ids: [] });

	// ── 2. Batch duplicate check — one query per 500-row chunk ─────────────────
	const allNorms     = prepared.map(r => r.phoneNorm);
	gMap  = new Map<string, string>(); // phoneNorm → contact_id

	for (const normChunk of chunk(allNorms, BATCH_SIZE)) {
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('id, phone_normalized')
			.eq('user_id', ownerId)
			.in('phone_normalized', normChunk);
		for (const row of (data ?? [])) {
			existingMap.set(row.phone_normalized, row.id);
		}
	}

	// ── 3. Split into new vs duplicate ─────────────────────────────────────────
	let duplicates = 0;
	const duplicateIds: string[] = [];
	const toInsert: PreparedRow[] = [];

	for (const row of prepared) {
		const existingId = existingMap.get(row.phoneNorm);
		if (existingId) {
			duplicateIds.push(existingId);
			duplicates++;
		} else {
			toInsert.push(row);
		}
	}

	// ── 4. Batch insert new contacts ───────────────────────────────────────────
	let created    = 0;
	let errors     = 0;
	const newIds: string[] = [];

	for (const insertChunk of chunk(toInsert, BATCH_SIZE)) {
		const records = insertChunk.map(row => ({
			user_id:          ownerId,
			name:             row.name,
			phone:            row.rawPhone,
			phone_normalized: row.phoneNorm,
			email:            row.email,
			email_normalized: row.emailNorm,
			company:          row.company,
			title:            row.title,
			status:           'active',
		}));

		const { data: inserted, error: insertErr } = await supabaseAdmin
			.from('contacts')
			.insert(records)
			.select('id');

		if (insertErr) {
			console.error('[contacts POST] batch insert error:', insertErr.message);
			errors += insertChunk.length;
		} else {
			const ids = (inserted ?? []).map((r: { id: string }) => r.id);
			newIds.push(...ids);
			created += ids.length;
		}
	}

	const contactIds = [...duplicateIds, ...newIds];

	// ── 5. Batch link to call list ─────────────────────────────────────────────
	if (call_list_id && newIds.length) {
		const linkRows = newIds.map((contact_id, i) => ({
			call_list_id,
			contact_id,
			status: 'pending',
			queue_position: duplicates + i,
		}));
		for (const linkChunk of chunk(linkRows, BATCH_SIZE)) {
			await supabaseAdmin
				.from('call_list_contacts')
				.upsert(linkChunk, { onConflict: 'call_list_id,contact_id' });
		}
	}

	return json({ created, duplicates, errors, contact_ids: contactIds });
};
