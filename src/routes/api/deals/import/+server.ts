import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, parseCSV } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { csv, fieldMap } = await request.json();
	// fieldMap: { csvColumn: crmField } e.g. { "Deal Name": "title", "Amount": "value" }

	if (!csv) throw error(400, 'csv required');
	const rows = parseCSV(csv);
	if (rows.length < 2) return json({ created: 0, errors: 0 });

	const headers = rows[0];
	const dataRows = rows.slice(1).filter(r => r.some(c => c));

	// Use fieldMap or auto-detect common column names
	const getCol = (crmField: string): number => {
		if (fieldMap?.[crmField]) {
			return headers.findIndex(h => h === fieldMap[crmField]);
		}
		const aliases: Record<string, string[]> = {
			title: ['title','deal','name','deal name','opportunity','subject'],
			value: ['value','amount','deal value','revenue','price','$'],
			stage: ['stage','status','pipeline stage'],
			contact_name: ['contact','contact name','person','full name','name'],
			client_name: ['client','account','company','organization'],
			notes: ['notes','description','details'],
			expected_close: ['close date','expected close','close','due date','target date'],
		};
		const alts = aliases[crmField] ?? [crmField];
		return headers.findIndex(h => alts.some(a => h.toLowerCase().includes(a.toLowerCase())));
	};

	const titleIdx = getCol('title');
	const valueIdx = getCol('value');
	const stageIdx = getCol('stage');
	const contactIdx = getCol('contact_name');
	const clientIdx = getCol('client_name');
	const notesIdx = getCol('notes');
	const closeIdx = getCol('expected_close');

	if (titleIdx === -1) throw error(400, 'Could not find title/deal name column');

	const VALID_STAGES = ['prospect','qualified','demo','proposal','negotiation','won','lost'];

	let created = 0, errors = 0;
	const errorRows: Array<{row:number;error:string}> = [];

	for (const [i, row] of dataRows.entries()) {
		const title = row[titleIdx]?.trim();
		if (!title) continue;

		const rawValue = valueIdx >= 0 ? row[valueIdx]?.replace(/[$,\s]/g, '') : '0';
		const value = parseFloat(rawValue ?? '0') || 0;
		const rawStage = stageIdx >= 0 ? row[stageIdx]?.trim().toLowerCase() : 'prospect';
		const stage = VALID_STAGES.find(s => rawStage?.includes(s)) ?? 'prospect';
		const contactName = contactIdx >= 0 ? row[contactIdx]?.trim() : null;
		const clientName = clientIdx >= 0 ? row[clientIdx]?.trim() : null;

		// Try to find contact by name
		let contactId: string | null = null;
		if (contactName) {
			const { data: contact } = await supabaseAdmin.from('contacts').select('id').eq('user_id', ownerId).ilike('name', `%${contactName}%`).maybeSingle();
			contactId = contact?.id ?? null;
		}

		// Try to find client by name
		let clientId: string | null = null;
		if (clientName) {
			const { data: client } = await supabaseAdmin.from('clients').select('id').eq('user_id', ownerId).ilike('name', `%${clientName}%`).maybeSingle();
			clientId = client?.id ?? null;
		}

		const closeDate = closeIdx >= 0 && row[closeIdx] ? new Date(row[closeIdx]).toISOString().slice(0,10) : null;
		const notes = notesIdx >= 0 ? row[notesIdx]?.trim() || null : null;

		const { error: e } = await supabaseAdmin.from('deals').insert({
			user_id: ownerId, title, value, stage, contact_id: contactId, client_id: clientId,
			expected_close: closeDate, notes, probability: stage === 'prospect' ? 10 : stage === 'qualified' ? 25 : stage === 'demo' ? 40 : stage === 'proposal' ? 60 : stage === 'negotiation' ? 80 : 0,
		});

		if (e) { errors++; errorRows.push({ row: i + 2, error: e.message }); }
		else created++;
	}

	return json({ created, errors, errorRows: errorRows.slice(0, 10), headers, detected: { titleIdx, valueIdx, stageIdx, contactIdx, clientIdx } });
};
