import { supabaseAdmin } from './supabase';

interface CampaignCadence {
	calls_per_lead: number | null;
	cadence_days: number | null;
}

/**
 * Called after a call outcome is saved for a contact in a campaign.
 * - Increments attempt_count on call_list_contacts
 * - Marks cadence_complete when done or outcome is terminal
 * - Creates a follow-up task dated at the next cadence interval
 *
 * Designed to be fire-and-forget (don't await at callsite).
 */
export async function processCadence({
	contactId,
	callListId,
	userId,
	outcome,
	callId,
}: {
	contactId: string;
	callListId: string | null;
	userId: string;
	outcome: string;
	callId: string;
}): Promise<void> {
	// These outcomes terminate the cadence — no follow-up task created
	const DEAD_OUTCOMES = new Set([
		'do_not_call',
		'not_interested',
		'disconnected',
		'signed_up',
	]);

	if (!callListId) return;

	// Resolve campaign cadence settings via call_lists → campaigns
	const { data: list } = await supabaseAdmin
		.from('call_lists')
		.select('campaign_id, campaigns(calls_per_lead, cadence_days)')
		.eq('id', callListId)
		.single();

	if (!list?.campaigns) return;

	const campaignId: string = list.campaign_id;
	const campaign = list.campaigns as unknown as CampaignCadence;
	const { calls_per_lead, cadence_days } = campaign;

	// No cadence if single-attempt campaign or settings not configured
	if (!calls_per_lead || calls_per_lead <= 1 || !cadence_days) return;

	// Fetch the call_list_contacts row
	const { data: clc } = await supabaseAdmin
		.from('call_list_contacts')
		.select('id, attempt_count, cadence_complete')
		.eq('call_list_id', callListId)
		.eq('contact_id', contactId)
		.single();

	if (!clc) return;
	if (clc.cadence_complete) return; // already finished, nothing to do

	const currentAttemptCount: number = clc.attempt_count ?? 0;
	const newAttemptCount = currentAttemptCount + 1;
	const isDead = DEAD_OUTCOMES.has(outcome);
	const cadenceComplete = isDead || newAttemptCount >= calls_per_lead;

	// Build the update payload
	const updateData: Record<string, unknown> = {
		attempt_count: newAttemptCount,
		last_called_at: new Date().toISOString(),
		cadence_complete: cadenceComplete,
	};

	let nextFollowUpDate: Date | null = null;
	if (!cadenceComplete) {
		const intervalDays = cadence_days / (calls_per_lead - 1);
		nextFollowUpDate = new Date();
		nextFollowUpDate.setDate(nextFollowUpDate.getDate() + Math.round(intervalDays));
		updateData.next_follow_up_at = nextFollowUpDate.toISOString();
	} else {
		updateData.next_follow_up_at = null;
	}

	await supabaseAdmin
		.from('call_list_contacts')
		.update(updateData)
		.eq('id', clc.id);

	// Create follow-up task if more attempts remain
	if (!cadenceComplete && nextFollowUpDate) {
		const { data: contact } = await supabaseAdmin
			.from('contacts')
			.select('name, company')
			.eq('id', contactId)
			.single();

		const contactDisplay = contact?.name ?? 'contact';
		const attemptLabel = `Attempt ${newAttemptCount + 1} of ${calls_per_lead}`;

		await supabaseAdmin.from('tasks').insert({
			user_id: userId,
			title: `Call ${contactDisplay} — ${attemptLabel}`,
			task_type: 'call',
			priority: 'medium',
			status: 'pending',
			due_date: nextFollowUpDate.toISOString(),
			contact_id: contactId,
			campaign_id: campaignId,
			notes: `Cadence follow-up. Previous outcome: ${outcome}. Campaign attempt ${newAttemptCount} of ${calls_per_lead}.`,
			source: 'cadence',
			source_id: callId,
		});
	}
}
