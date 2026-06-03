import { supabaseAdmin } from './supabase';

interface RoutingRule {
	id: string;
	lead_source_id: string | null;
	rule_order: number;
	condition_field: string;
	condition_operator: string;
	condition_value: string | null;
	action_type: string;
	action_value: string | null;
	stop_on_match: boolean;
	is_active: boolean;
}

interface IncomingLead {
	id: string;
	name?: string | null;
	phone?: string | null;
	email?: string | null;
	company?: string | null;
	lead_source?: string | null;
	utm_source?: string | null;
	utm_medium?: string | null;
	utm_campaign?: string | null;
	contact_type?: string | null;
	[key: string]: unknown;
}

function evaluateCondition(rule: RoutingRule, lead: IncomingLead): boolean {
	const field = rule.condition_field;
	const op = rule.condition_operator;
	const val = (rule.condition_value ?? '').toLowerCase();

	// Get the field value from the lead
	let fieldValue = '';
	if (field === 'any_field') {
		// Check all string fields
		fieldValue = [lead.name, lead.email, lead.phone, lead.company, lead.lead_source]
			.filter(Boolean).join(' ').toLowerCase();
	} else {
		fieldValue = String(lead[field] ?? '').toLowerCase();
	}

	switch (op) {
		case 'contains':     return fieldValue.includes(val);
		case 'not_contains': return !fieldValue.includes(val);
		case 'equals':       return fieldValue === val;
		case 'starts_with':  return fieldValue.startsWith(val);
		case 'ends_with':    return fieldValue.endsWith(val);
		case 'is_empty':     return !fieldValue || fieldValue.trim() === '';
		case 'not_empty':    return !!(fieldValue && fieldValue.trim());
		case 'matches_regex': {
			try { return new RegExp(val, 'i').test(fieldValue); } catch { return false; }
		}
		default: return false;
	}
}

async function applyAction(
	rule: RoutingRule,
	lead: IncomingLead,
	_userId: string,
	_campaignId?: string | null
): Promise<{ campaignId?: string; callListId?: string; skip?: boolean }> {
	const result: { campaignId?: string; callListId?: string; skip?: boolean } = {};

	switch (rule.action_type) {
		case 'assign_campaign': {
			if (rule.action_value) result.campaignId = rule.action_value;
			break;
		}
		case 'assign_call_list': {
			if (rule.action_value) result.callListId = rule.action_value;
			break;
		}
		case 'add_tag': {
			if (rule.action_value && lead.id) {
				const tag = rule.action_value.trim();
				// Read current tags, append if not present
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('tags')
					.eq('id', lead.id)
					.single();
				const currentTags: string[] = contact?.tags ?? [];
				if (!currentTags.includes(tag)) {
					await supabaseAdmin
						.from('contacts')
						.update({ tags: [...currentTags, tag] })
						.eq('id', lead.id);
				}
			}
			break;
		}
		case 'set_contact_type': {
			if (rule.action_value && lead.id) {
				await supabaseAdmin
					.from('contacts')
					.update({ contact_type: rule.action_value })
					.eq('id', lead.id);
			}
			break;
		}
		case 'set_status': {
			if (rule.action_value && lead.id) {
				await supabaseAdmin
					.from('contacts')
					.update({ status: rule.action_value })
					.eq('id', lead.id);
			}
			break;
		}
		case 'skip': {
			// Soft-delete the contact immediately
			if (lead.id) {
				await supabaseAdmin
					.from('contacts')
					.update({ deleted_at: new Date().toISOString() })
					.eq('id', lead.id);
			}
			result.skip = true;
			break;
		}
	}

	return result;
}

/**
 * Run all matching routing rules for a newly arrived lead.
 * Returns the final campaign_id and call_list_id to use (rules can override the source defaults).
 */
export async function applyRoutingRules(
	lead: IncomingLead,
	userId: string,
	leadSourceId: string | null,
	defaultCampaignId?: string | null,
	defaultCallListId?: string | null
): Promise<{ campaignId: string | null; callListId: string | null; skip: boolean }> {

	// Load rules for this source + global rules (null source_id), ordered
	const { data: rules } = await supabaseAdmin
		.from('lead_routing_rules')
		.select('*')
		.eq('user_id', userId)
		.eq('is_active', true)
		.or(leadSourceId
			? `lead_source_id.eq.${leadSourceId},lead_source_id.is.null`
			: 'lead_source_id.is.null')
		.order('rule_order', { ascending: true });

	if (!rules || rules.length === 0) {
		return {
			campaignId: defaultCampaignId ?? null,
			callListId: defaultCallListId ?? null,
			skip: false,
		};
	}

	let campaignId = defaultCampaignId ?? null;
	let callListId = defaultCallListId ?? null;
	let skip = false;

	for (const rule of rules as RoutingRule[]) {
		if (!evaluateCondition(rule, lead)) continue;

		const result = await applyAction(rule, lead, userId, campaignId);
		if (result.campaignId) campaignId = result.campaignId;
		if (result.callListId) callListId = result.callListId;
		if (result.skip) { skip = true; break; }
		if (rule.stop_on_match) break;
	}

	return { campaignId, callListId, skip };
}
