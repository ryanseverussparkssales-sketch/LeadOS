import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

const CRM_FIELDS = [
	{ key:'name', label:'Full Name', required:true },
	{ key:'first_name', label:'First Name' },
	{ key:'last_name', label:'Last Name' },
	{ key:'phone', label:'Phone', required:true },
	{ key:'email', label:'Email' },
	{ key:'company', label:'Company/Organization' },
	{ key:'title', label:'Job Title' },
	{ key:'website', label:'Website URL' },
	{ key:'linkedin_url', label:'LinkedIn URL' },
	{ key:'contact_type', label:'Contact Type (lead/prospect/customer/creator/partner/vendor)' },
	{ key:'lead_source', label:'Lead Source' },
	{ key:'notes', label:'Notes' },
	{ key:'is_business', label:'Is Business (yes/no)' },
	{ key:'skip', label:'Skip this column' },
];

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	const ownerId = await getEffectiveUserId(user.id);
	const { headers, sampleRows } = await request.json();
	if (!headers?.length) throw error(400, 'headers required');

	// Fetch existing custom fields for this user
	const { data: customFields } = await supabaseAdmin.from('contact_field_definitions').select('field_key, name, field_type').eq('user_id', ownerId);

	const crmFieldList = [
		...CRM_FIELDS,
		...(customFields ?? []).map(f => ({ key:`custom:${f.field_key}`, label:`Custom: ${f.name} (${f.field_type})` }))
	];

	const prompt = `You are mapping CSV column headers to CRM contact fields.

CSV Headers: ${JSON.stringify(headers)}
Sample data (first 3 rows):
${sampleRows.slice(0,3).map((r: string[], i: number) => `Row ${i+1}: ${JSON.stringify(r)}`).join('\n')}

Available CRM fields:
${crmFieldList.map(f => `- ${f.key}: ${f.label}`).join('\n')}

Rules:
- Map each CSV header to the most appropriate CRM field
- Use "skip" for columns that are irrelevant (IDs, internal codes, etc.)
- If a column contains something useful but no matching field, suggest creating a custom field
- For name columns: if you see "First Name" AND "Last Name" separately, map them to first_name and last_name
- Confidence: high=obvious match, medium=reasonable guess, low=uncertain

Return ONLY valid JSON:
{
  "mappings": {
    "CSV_HEADER": "crm_field_key"
  },
  "confidence": {
    "CSV_HEADER": "high|medium|low"
  },
  "suggestedCustomFields": [
    { "csvHeader": "Column Name", "fieldKey": "snake_case_key", "fieldName": "Display Name", "fieldType": "text|number|select|date|boolean|url", "reason": "why this is useful" }
  ],
  "notes": "any important observations about the data"
}`;

	let mapping: { mappings: Record<string,string>; confidence: Record<string,string>; suggestedCustomFields: unknown[]; notes: string };
	try {
		const { env } = await import('$env/dynamic/private');
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
		const msg = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 1024,
			messages: [{ role: 'user', content: prompt }],
		});
		const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
		const match = text.match(/\{[\s\S]*\}/);
		mapping = match ? JSON.parse(match[0]) : { mappings:{}, confidence:{}, suggestedCustomFields:[], notes:'' };
	} catch (e) {
		console.error('AI map error:', e);
		mapping = { mappings:{}, confidence:{}, suggestedCustomFields:[], notes:'AI mapping unavailable' };
	}
	return json({ success: true });
};
