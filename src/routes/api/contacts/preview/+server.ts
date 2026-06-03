import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone, parseCSV } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { csv, fieldMapping } = await request.json();
	// fieldMapping: { "CSV Header": "crm_field_key" }

	if (!csv) throw error(400, 'csv required');
	const rows = parseCSV(csv);
	if (rows.length < 2) return json({ rows: [], headers: [] });

	const headers = rows[0];
	const dataRows = rows.slice(1).filter(r => r.some(c => c?.trim()));

	// Build column index map
	const colIdx: Record<string, number> = {};
	for (const [csvHeader, crmField] of Object.entries(fieldMapping ?? {})) {
		const idx = headers.indexOf(csvHeader);
		if (idx >= 0) colIdx[crmField as string] = idx;
	}

	// Helper: get value by crm field key (supports first_name + last_name → name)
	const getVal = (row: string[], field: string): string => {
		const idx = colIdx[field];
		return idx !== undefined ? (row[idx]?.trim() ?? '') : '';
	};

	// Bulk fetch existing contacts for dedup
	const existingPhones = new Set<string>();
	const existingEmails = new Set<string>();
	const { data: existingContacts } = await supabaseAdmin
		.from('contacts')
		.select('phone_normalized, email_normalized')
		.eq('user_id', ownerId);
	for (const c of existingContacts ?? []) {
		if (c.phone_normalized) existingPhones.add(c.phone_normalized);
		if (c.email_normalized) existingEmails.add(c.email_normalized.toLowerCase());
	}

	const preview = dataRows.slice(0, 200).map((row, i) => {
		// Build name
		let name = getVal(row, 'name');
		if (!name) {
			const fn = getVal(row, 'first_name');
			const ln = getVal(row, 'last_name');
			name = `${fn} ${ln}`.trim();
		}

		const phone = getVal(row, 'phone');
		const email = getVal(row, 'email');
		const phoneNorm = phone ? normalizePhone(phone) : '';
		const emailNorm = email ? email.toLowerCase() : '';

		// Determine status
		let status: 'new' | 'duplicate' | 'invalid' | 'update' = 'new';
		let dupReason = '';

		if (!name && !phone && !email) {
			status = 'invalid';
			dupReason = 'No name, phone, or email';
		} else if (!name) {
			status = 'invalid';
			dupReason = 'Missing name';
		// phone + email both optional — creators/influencers may only have a name/handle
		} else if (phoneNorm && existingPhones.has(phoneNorm)) {
			status = 'duplicate';
			dupReason = 'Same phone number already exists';
		} else if (emailNorm && existingEmails.has(emailNorm)) {
			status = 'duplicate';
			dupReason = 'Same email already exists';
		}

		// Build preview record
		const record: Record<string, string> = { name, phone, email };
		for (const [field, idx] of Object.entries(colIdx)) {
			if (!['name','first_name','last_name','phone','email'].includes(field)) {
				record[field] = row[idx as number]?.trim() ?? '';
			}
		}

		return { rowNum: i + 2, status, dupReason, record, rawRow: row, approved: status === 'new' };
	});

	const counts = { new: preview.filter(r=>r.status==='new').length, duplicate: preview.filter(r=>r.status==='duplicate').length, invalid: preview.filter(r=>r.status==='invalid').length };

	return json({ rows: preview, headers, counts });
};
