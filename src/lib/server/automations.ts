import { supabaseAdmin } from './supabase';
import { env } from '$env/dynamic/private';

interface AutomationAction { type: string; params: Record<string, string>; }
interface AutomationCondition { field: string; operator: string; value: string; }
interface AutomationContext {
	contactId?: string;
	callOutcome?: string;
	leadSource?: string;
	contactType?: string;
}

function evaluateCondition(cond: AutomationCondition, ctx: AutomationContext): boolean {
	const fieldMap: Record<string, string | undefined> = {
		lead_source: ctx.leadSource,
		contact_type: ctx.contactType,
		outcome: ctx.callOutcome,
	};
	const actual = fieldMap[cond.field] ?? '';
	if (cond.operator === 'equals') return actual === cond.value;
	if (cond.operator === 'not_equals') return actual !== cond.value;
	if (cond.operator === 'contains') return actual.includes(cond.value);
	return false;
}

async function executeAction(action: AutomationAction, userId: string, ctx: AutomationContext): Promise<void> {
	const { contactId } = ctx;
	switch (action.type) {
		case 'create_task':
			if (contactId) {
				await supabaseAdmin.from('tasks').insert({
					user_id: userId, contact_id: contactId,
					title: action.params.title ?? 'Follow up',
					task_type: 'follow_up', priority: 'medium', status: 'pending',
					due_date: new Date(Date.now() + 86400000).toISOString(), // due tomorrow
					ai_suggested: true,
				});
			}
			break;
		case 'add_tag':
			if (contactId && action.params.tag) {
				// Find or create tag
				const { data: tag } = await supabaseAdmin.from('contact_tags').select('id').eq('user_id', userId).eq('name', action.params.tag).maybeSingle();
				let tagId = tag?.id;
				if (!tagId) {
					const { data: newTag } = await supabaseAdmin.from('contact_tags').insert({ user_id: userId, name: action.params.tag, color: '#6366f1' }).select('id').single();
					tagId = newTag?.id;
				}
				if (tagId) await supabaseAdmin.from('contact_tag_mappings').upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: 'contact_id,tag_id' });
			}
			break;
		case 'change_status':
			if (contactId && action.params.status) {
				await supabaseAdmin.from('contacts').update({ status: action.params.status }).eq('id', contactId);
			}
			break;
		case 'send_sms':
			if (contactId && action.params.message) {
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('phone')
					.eq('id', contactId)
					.maybeSingle();
				const contactPhone = contact?.phone;
				if (contactPhone && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) {
					const message = action.params.message;
					const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
					const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
						method: 'POST',
						headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
						body: new URLSearchParams({ To: contactPhone, From: env.TWILIO_PHONE_NUMBER, Body: message }),
					});
					if (!res.ok) {
						const errText = await res.text();
						console.error('[automations] send_sms failed:', errText);
					}
				}
			}
			break;
	}
}

/**
 * Run all matching automation rules for a given trigger + context
 */
export async function runAutomations(
	userId: string,
	triggerType: string,
	ctx: AutomationContext
): Promise<void> {
	const { data: rules } = await supabaseAdmin
		.from('automation_rules')
		.select('*')
		.eq('user_id', userId)
		.eq('trigger_type', triggerType)
		.eq('enabled', true);

	for (const rule of rules ?? []) {
		const conditions: AutomationCondition[] = rule.conditions ?? [];
		const allMatch = conditions.length === 0 || conditions.every(c => evaluateCondition(c, ctx));
		if (!allMatch) continue;

		const actions: AutomationAction[] = rule.actions ?? [];
		for (const action of actions) {
			await executeAction(action, userId, ctx).catch(console.error);
		}

		// Update run count
		await supabaseAdmin.from('automation_rules').update({ run_count: (rule.run_count ?? 0) + 1, last_run_at: new Date().toISOString() }).eq('id', rule.id);
	}
}
