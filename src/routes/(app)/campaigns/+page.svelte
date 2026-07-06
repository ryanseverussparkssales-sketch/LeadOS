<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import TemplatePicker from '$lib/components/TemplatePicker.svelte';
	interface Client { id: string; name: string; user_id: string; }
	interface Project { id: string; name: string; client: Client; }
	interface CallList { id: string; name: string; status: string; call_list_contacts: [{count: number}]; }
	interface WinCondition { outcome: string; label: string; weight: number; }
	interface Campaign { id: string; name: string; status: string; project: Project; call_lists: CallList[]; campaign_type: string; description: string | null; goal: string | null; target_contacts: number | null; email_sequence_id: string | null; from_email_account_id: string | null; from_phone_number_id: string | null; win_outcome: string | null; win_label: string | null; win_count: number | null; target_wins: number | null; custom_outcomes: {value:string;label:string}[] | null; win_conditions: WinCondition[] | null; }

	const OUTCOME_OPTIONS = [
		{ value: 'appointment_set', label: 'Appointment Set' },
		{ value: 'demo_scheduled', label: 'Demo Scheduled' },
		{ value: 'meeting_confirmed', label: 'Meeting Confirmed' },
		{ value: 'callback', label: 'Requested Callback' },
		{ value: 'info_requested', label: 'Requested Info/Materials' },
		{ value: 'decision_maker', label: 'Reached Decision Maker' },
		{ value: 'referral', label: 'Gave a Referral' },
		{ value: 'follow_up_agreed', label: 'Agreed to Follow Up' },
		{ value: 'proposal_requested', label: 'Requested Proposal' },
		{ value: 'signed_up', label: 'Signed Up / Converted' },
		{ value: 'investment_interest', label: 'Investment Interest' },
	];

	function getWinConditions(campaign: Campaign): WinCondition[] {
		if (Array.isArray(campaign.win_conditions) && campaign.win_conditions.length > 0) {
			return campaign.win_conditions;
		}
		if (campaign.win_outcome) {
			return [{ outcome: campaign.win_outcome, label: campaign.win_label ?? campaign.win_outcome, weight: 1 }];
		}
		return [];
	}

	const CAMPAIGN_TYPES = [
		{ value: 'call', label: '📞 Call', desc: 'Power dialer + call lists' },
		{ value: 'email', label: '✉️ Email', desc: 'Automated email sequences' },
		{ value: 'sms', label: '💬 SMS', desc: 'Bulk text message outreach' },
		{ value: 'mixed', label: '⚡ Mixed', desc: 'Call + email + SMS combined' },
	];

	const TYPE_ICONS: Record<string, string> = {
		call: '📞', email: '✉️', sms: '💬', mixed: '⚡',
	};

	function typeLabel(t: string) {
		return `${TYPE_ICONS[t] ?? '📞'} ${t.charAt(0).toUpperCase() + t.slice(1)}`;
	}

	let campaigns = $state<Campaign[]>([]);
	let selectedCampaign = $state<Campaign | null>(null);

	// Review Queue — campaigns pending client approval or ready to activate
	const reviewQueue = $derived(campaigns.filter(c => (c as any).status === 'pending_approval'));
	let activatingId = $state<string | null>(null);

	async function activateCampaign(id: string) {
		activatingId = id;
		const r = await apiFetch(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
		if (r.ok) {
			const updated = await r.json();
			campaigns = campaigns.map(c => c.id === id ? { ...c, ...(updated as any) } : c);
			if (selectedCampaign?.id === id) selectedCampaign = { ...selectedCampaign, ...(updated as any) };
			toastSuccess('Campaign activated — SDRs can now dial');
		} else {
			toastError('Failed to activate campaign');
		}
		activatingId = null;
	}

	async function rejectCampaign(id: string) {
		const r = await apiFetch(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
		if (r.ok) {
			campaigns = campaigns.map(c => c.id === id ? { ...c, status: 'draft' } as any : c);
			if (selectedCampaign?.id === id) selectedCampaign = { ...selectedCampaign, status: 'draft' } as any;
			toastSuccess('Campaign sent back to draft');
		} else {
			toastError('Failed to update campaign');
		}
	}

	// Campaign Contacts state (replaces per-list UI)
	let campaignContacts = $state<any[]>([]);
	let campaignListId = $state<string | null>(null);
	let loadingCampaignContacts = $state(false);
	let showAddContacts = $state<'manual' | 'existing' | null>(null);
	// Lazy contact loading — only fetch when the contacts section is expanded
	let showContacts = $state(false);
	let contactsLoadedForId = $state<string | null>(null);

	// Manual add form
	let manualName = $state('');
	let manualPhone = $state('');
	let manualEmail = $state('');
	let manualCompany = $state('');
	let addingManual = $state(false);

	// Existing contacts picker
	let existingContacts = $state<any[]>([]);
	let existingSearch = $state('');
	let selectedExisting = $state<Set<string>>(new Set());
	let loadingExisting = $state(false);
	let addingExisting = $state(false);

	async function loadCampaignContacts(campaignId: string) {
		loadingCampaignContacts = true;
		const r = await apiFetch(`/api/campaigns/${campaignId}/contacts?limit=200`);
		if (r.ok) {
			const d = await r.json();
			campaignContacts = d.contacts ?? [];
			campaignListId = d.list_id;
		} else {
			toastError('Failed to load campaign contacts');
		}
		loadingCampaignContacts = false;
	}

	async function addManualContact() {
		if (!manualName.trim() || !manualPhone.trim() || !selectedCampaign) return;
		addingManual = true;
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/contacts`, {
			method: 'POST',
			body: JSON.stringify({ mode: 'manual', contact: { name: manualName, phone: manualPhone, email: manualEmail, company: manualCompany } }),
		});
		if (r.ok) {
			await loadCampaignContacts(selectedCampaign.id);
			manualName = ''; manualPhone = ''; manualEmail = ''; manualCompany = '';
			showAddContacts = null;
			toastSuccess('Contact added');
		} else {
			toastError('Failed to add contact');
		}
		addingManual = false;
	}

	async function searchExistingContacts() {
		if (!existingSearch.trim()) return;
		loadingExisting = true;
		const r = await apiFetch(`/api/contacts/filtered?search=${encodeURIComponent(existingSearch)}&limit=30`);
		if (r.ok) {
			const d = await r.json();
			existingContacts = Array.isArray(d) ? d : (d.data ?? []);
		}
		loadingExisting = false;
	}

	async function addExistingContacts() {
		if (!selectedCampaign || selectedExisting.size === 0) return;
		addingExisting = true;
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/contacts`, {
			method: 'POST',
			body: JSON.stringify({ mode: 'existing', contactIds: [...selectedExisting] }),
		});
		if (r.ok) {
			await loadCampaignContacts(selectedCampaign.id);
			selectedExisting = new Set();
			existingContacts = [];
			existingSearch = '';
			showAddContacts = null;
			toastSuccess('Contacts added to campaign');
		} else {
			toastError('Failed to add contacts');
		}
		addingExisting = false;
	}

	async function removeFromCampaign(listContactId: string) {
		if (!selectedCampaign) return;
		if (!confirm('Remove this contact from the campaign?')) return;
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/contacts?list_contact_id=${listContactId}`, { method: 'DELETE' });
		if (r.ok) {
			campaignContacts = campaignContacts.filter(c => c.list_contact_id !== listContactId);
			toastSuccess('Contact removed');
		} else {
			toastError('Failed to remove contact');
		}
	}

	// Campaign Goals
	interface Goal { id:string; goal_type:string; target_value:number; period:string; }
	let goals = $state<Goal[]>([]);
	let newGoalType = $state('calls_per_day');
	let newGoalTarget = $state(20);
	let newGoalPeriod = $state('daily');
	let savingGoal = $state(false);

	async function loadGoals(campaignId: string) {
		const res = await apiFetch(`/api/campaign-goals?campaign_id=${campaignId}`);
		goals = res.ok ? await res.json() : [];
	}

	async function saveGoal() {
		if (!selectedCampaign) return;
		savingGoal = true;
		const res = await apiFetch('/api/campaign-goals', { method: 'POST', body: JSON.stringify({ campaignId: selectedCampaign.id, goalType: newGoalType, targetValue: newGoalTarget, period: newGoalPeriod }) });
		if (res.ok) { const g = await res.json(); goals = [...goals.filter(x => !(x.goal_type === g.goal_type && x.period === g.period)), g]; toastSuccess('Goal saved'); }
		else { toastError('Failed to save goal'); }
		savingGoal = false;
	}

	async function deleteGoal(id: string) {
		if (confirmDeleteGoal !== id) { confirmDeleteGoal = id; return; }
		const res = await apiFetch(`/api/campaign-goals/${id}`, { method: 'DELETE' });
		if (res.ok) {
			goals = goals.filter(g => g.id !== id);
			toastSuccess('Goal deleted');
		} else {
			toastError('Failed to delete goal');
		}
		confirmDeleteGoal = null;
	}

	const GOAL_LABELS: Record<string,string> = { calls_per_day:'Calls / day', callback_rate:'Callback rate %', answer_rate:'Answer rate %', talk_time_minutes:'Talk time (min)' };
	// Clients/projects for campaign creation
	let clients = $state<Client[]>([]);
	let projects = $state<Project[]>([]);
	let showNewCampaign = $state(false);
	let newCampaignName = $state('');
	let newCampaignProjectId = $state('');
	let newCampaignType = $state('call');
	let newCampaignDesc = $state('');
	let newCampaignGoal = $state('');
	let sequences = $state<{id:string;name:string}[]>([]);
	let newSequenceId = $state('');

	// Sender configuration + win/goal state
	let emailAccounts = $state<{id:string;label:string;email_address:string}[]>([]);
	let phoneNumbers = $state<{id:string;phone_number:string;friendly_name:string|null}[]>([]);
	let newCampaignEmailAccountId = $state('');
	let newCampaignPhoneNumberId = $state('');
	let newWinOutcome = $state('');
	let newWinLabel = $state('');
	let newTargetWins = $state<number|null>(null);
	let newWinConditions = $state<WinCondition[]>([]);
	let addingWinOutcome = $state('');
	let addingWinWeight = $state(1);

	function addWinCondition() {
		if (!addingWinOutcome || newWinConditions.find(wc => wc.outcome === addingWinOutcome)) return;
		const label = OUTCOME_OPTIONS.find(o => o.value === addingWinOutcome)?.label ?? addingWinOutcome;
		newWinConditions = [...newWinConditions, { outcome: addingWinOutcome, label, weight: addingWinWeight }];
		addingWinOutcome = '';
		addingWinWeight = 1;
	}
	function removeWinCondition(outcome: string) {
		newWinConditions = newWinConditions.filter(wc => wc.outcome !== outcome);
	}

	// Edit form win conditions
	let editWinConditions = $state<WinCondition[]>([]);
	let editAddingWinOutcome = $state('');
	let editAddingWinWeight = $state(1);

	function editAddWinCondition() {
		if (!editAddingWinOutcome || editWinConditions.find(wc => wc.outcome === editAddingWinOutcome)) return;
		const label = OUTCOME_OPTIONS.find(o => o.value === editAddingWinOutcome)?.label ?? editAddingWinOutcome;
		editWinConditions = [...editWinConditions, { outcome: editAddingWinOutcome, label, weight: editAddingWinWeight }];
		editAddingWinOutcome = '';
		editAddingWinWeight = 1;
	}
	function editRemoveWinCondition(outcome: string) {
		editWinConditions = editWinConditions.filter(wc => wc.outcome !== outcome);
	}
	let newDailyCallGoal = $state<number|null>(null);
	let newCallsPerLead = $state<number>(1);
	let newCadenceDays = $state<number>(14);

	// Bulk SMS state
	let bulkSmsCampaign = $state<Campaign | null>(null);
	let bulkSmsMsg = $state('');
	let sendingCampaignSms = $state(false);

	// Edit campaign state
	let editingCampaign = $state<Campaign | null>(null);
	let campaignEditForm = $state<{ name: string; status: string; campaign_type: string; description: string; goal: string; daily_call_goal?: number|null; calls_per_lead?: number; cadence_days?: number; win_outcome?: string; win_label?: string; target_wins?: number|null; }>({ name: '', status: 'active', campaign_type: 'call', description: '', goal: '' });

	// Email blast composer
	let showEmailComposer = $state(false);
	let emailSubject = $state('');
	let emailBody = $state('');
	let sendingEmailBlast = $state(false);
	let emailBlastResult = $state('');
	let generatingCampaignEmail = $state(false);
	let campaignEmailPrompt = $state('');

	async function generateCampaignEmail() {
		if (!selectedCampaign) return;
		generatingCampaignEmail = true;
		try {
			const res = await apiFetch('/api/emails/generate', {
				method: 'POST',
				body: JSON.stringify({
					emailType: 'intro',
					customPrompt: campaignEmailPrompt || undefined,
					campaignName: selectedCampaign.name,
					campaignGoal: (selectedCampaign as any).goal,
					campaignWinLabel: selectedCampaign.win_label,
					contactName: '{{name}}',
					contactCompany: '{{company}}',
				}),
			});
			if (res.ok) {
				const d = await res.json();
				emailSubject = d.subject;
				emailBody = d.body;
			}
		} catch {}
		generatingCampaignEmail = false;
	}

	// Blast confirmation
	let showBlastConfirm = $state(false);
	let blastRecipientCount = $state(0);

	async function prepareBlast() {
		if (!selectedCampaign || !emailSubject.trim() || !emailBody.trim()) return;
		// Count recipients — fetch contacts and filter to those with email
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/contacts?limit=200`);
		if (r.ok) {
			const d = await r.json();
			const contacts = d.contacts ?? [];
			blastRecipientCount = contacts.filter((c: any) => c.email).length;
		}
		showBlastConfirm = true;
	}

	async function confirmBlast() {
		showBlastConfirm = false;
		await sendEmailBlast();
	}

	async function sendEmailBlast() {
		if (!selectedCampaign || !emailSubject.trim() || !emailBody.trim()) return;
		sendingEmailBlast = true; emailBlastResult = '';

		// Get campaign contacts
		const contactsRes = await apiFetch(`/api/campaigns/${selectedCampaign.id}/contacts?limit=200`);
		if (!contactsRes.ok) { emailBlastResult = '⚠ Could not load recipients — try again'; sendingEmailBlast = false; return; }
		const { contacts } = await contactsRes.json();
		const withEmail = contacts.filter((c: any) => c.email);

		if (withEmail.length === 0) {
			emailBlastResult = '⚠ No contacts with email addresses in this campaign';
			sendingEmailBlast = false;
			return;
		}

		let sent = 0, failed = 0;
		for (const c of withEmail) {
			const r = await apiFetch('/api/emails/send', {
				method: 'POST',
				body: JSON.stringify({
					to: c.email,
					subject: emailSubject,
					html: emailBody.replace(/\n/g, '<br>').replace(/\{\{name\}\}/g, c.name).replace(/\{\{company\}\}/g, c.company ?? ''),
					text: emailBody.replace(/\{\{name\}\}/g, c.name).replace(/\{\{company\}\}/g, c.company ?? ''),
					contactId: c.id,
					campaignId: selectedCampaign.id,
					projectId: selectedCampaign.project?.id,
					clientId: selectedCampaign.project?.client?.id,
					accountId: selectedCampaign.from_email_account_id ?? undefined,
					emailType: 'campaign',
				}),
			});
			if (r.ok) sent++; else failed++;
		}

		emailBlastResult = `✓ Sent to ${sent} contacts${failed ? `, ${failed} failed` : ''}`;
		sendingEmailBlast = false;
		if (sent > 0) { emailSubject = ''; emailBody = ''; showEmailComposer = false; }
	}

	function startEditCampaign(campaign: Campaign) {
		editingCampaign = campaign;
		campaignEditForm = {
			name: campaign.name,
			status: (campaign as Campaign & { status?: string }).status ?? 'active',
			campaign_type: campaign.campaign_type ?? 'call',
			description: campaign.description ?? '',
			goal: campaign.goal ?? '',
			daily_call_goal: (campaign as any).daily_call_goal ?? null,
			calls_per_lead: (campaign as any).calls_per_lead ?? 1,
			cadence_days: (campaign as any).cadence_days ?? 14,
			win_outcome: campaign.win_outcome ?? '',
			win_label: campaign.win_label ?? '',
			target_wins: campaign.target_wins ?? null,
		};
		editWinConditions = getWinConditions(campaign);
		editAddingWinOutcome = '';
		editAddingWinWeight = 1;
	}

	async function saveCampaignEdit() {
		if (!editingCampaign) return;
		const res = await apiFetch(`/api/campaigns/${editingCampaign.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ ...campaignEditForm, win_conditions: editWinConditions }),
		});
		if (res.ok) {
			const updated = await res.json();
			campaigns = campaigns.map(camp =>
				camp.id === editingCampaign!.id ? { ...camp, ...updated } : camp
			);
			if (selectedCampaign?.id === editingCampaign.id) {
				selectedCampaign = { ...selectedCampaign, ...updated };
			}
			editingCampaign = null;
			toastSuccess('Campaign saved');
		} else {
			toastError('Failed to save campaign');
		}
	}

	// SDR assignment state
	interface TeamMember { id: string; member_email: string; role: string; }
	let teamMembers = $state<TeamMember[]>([]);
	let campaignSdrs = $state<{id:string;sdr_id:string;team_member:{member_email:string}}[]>([]);

	async function loadCampaignSdrs(campaignId: string) {
		const r = await apiFetch(`/api/campaigns/${campaignId}/sdrs`);
		if (r.ok) campaignSdrs = await r.json();
	}
	async function assignSdr(teamMemberId: string) {
		if (!selectedCampaign) return;
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/sdrs`, { method:'POST', body: JSON.stringify({ teamMemberId }) });
		if (r.ok) { const d = await r.json(); campaignSdrs = [...campaignSdrs, d]; toastSuccess('Rep assigned'); }
		else { toastError('Failed to assign rep'); }
	}
	async function unassignSdr(sdrId: string) {
		if (!selectedCampaign) return;
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/sdrs?sdr_id=${sdrId}`, { method:'DELETE' });
		if (r.ok) {
			campaignSdrs = campaignSdrs.filter(s => s.sdr_id !== sdrId);
			toastSuccess('Rep removed');
		} else {
			toastError('Failed to remove rep');
		}
	}

	onMount(async () => {
		try {
			const [cr, pr, camr, seqr, emailRes, phoneRes] = await Promise.all([
				apiFetch('/api/clients'),
				apiFetch('/api/projects'),
				apiFetch('/api/campaigns'),
				apiFetch('/api/sequences'),
				apiFetch('/api/email-accounts'),
				apiFetch('/api/phone/numbers'),
			]);
			clients = cr.ok ? await cr.json() : [];
			projects = pr.ok ? await pr.json() : [];
			campaigns = camr.ok ? await camr.json() : [];
			sequences = seqr.ok ? await seqr.json() : [];
			emailAccounts = emailRes.ok ? await emailRes.json() : [];
			phoneNumbers = phoneRes.ok ? await phoneRes.json() : [];

			// Load team members for SDR assignment
			const teamRes = await apiFetch('/api/team');
			teamMembers = teamRes.ok ? (await teamRes.json()).filter((m: any) => !m.portal_access) : [];

			// Auto-select campaign from GlobalSearch deep link
			const selectId = get(page).url.searchParams.get('select');
			if (selectId) {
				const found = campaigns.find((c: Campaign) => c.id === selectId);
				if (found) await selectCampaign(found);
			}
		} catch (err) {
			console.error('[campaigns] Failed to load data:', err);
			clients = []; projects = []; campaigns = []; sequences = [];
			emailAccounts = []; phoneNumbers = [];
		}
	});

	async function createCampaign() {
		if (!newCampaignName.trim() || !newCampaignProjectId) return;
		const res = await apiFetch('/api/campaigns', {
			method: 'POST',
			body: JSON.stringify({
				name: newCampaignName,
				project_id: newCampaignProjectId,
				campaign_type: newCampaignType,
				description: newCampaignDesc || null,
				goal: newCampaignGoal || null,
				email_sequence_id: newSequenceId || null,
				from_email_account_id: newCampaignEmailAccountId || null,
				from_phone_number_id: newCampaignPhoneNumberId || null,
				win_outcome: newWinConditions.length === 1 ? newWinConditions[0].outcome : (newWinOutcome || null),
				win_label: newWinConditions.length === 1 ? newWinConditions[0].label : (newWinLabel || null),
				win_conditions: newWinConditions,
				target_wins: newTargetWins || null,
				daily_call_goal: newDailyCallGoal || null,
				calls_per_lead: newCallsPerLead || 1,
				cadence_days: newCadenceDays || 14,
			}),
		});
		if (res.ok) {
			newCampaignName = '';
			newCampaignDesc = '';
			newCampaignGoal = '';
			newCampaignType = 'call';
			newSequenceId = '';
			newCampaignEmailAccountId = '';
			newCampaignPhoneNumberId = '';
			newWinOutcome = '';
			newWinLabel = '';
			newTargetWins = null;
			newWinConditions = [];
			addingWinOutcome = '';
			addingWinWeight = 1;
			newDailyCallGoal = null;
			newCallsPerLead = 1;
			newCadenceDays = 14;
			showNewCampaign = false;
			toastSuccess('Campaign created');
			const r = await apiFetch('/api/campaigns');
			campaigns = r.ok ? await r.json() : campaigns;
		} else {
			toastError('Failed to create campaign');
		}
	}

	function openBulkSmsForCampaign(campaign: Campaign) {
		bulkSmsCampaign = campaign;
		bulkSmsMsg = '';
	}

	async function sendCampaignSms() {
		if (!bulkSmsCampaign || !bulkSmsMsg.trim()) return;
		sendingCampaignSms = true;

		// Get contacts for this campaign
		const contactsRes = await apiFetch(`/api/campaigns/${bulkSmsCampaign.id}/contacts?limit=200`);
		if (!contactsRes.ok) { sendingCampaignSms = false; return; }

		const { contacts } = await contactsRes.json();
		const withPhones = contacts.filter((c: any) => c.phone);

		let sent = 0, failed = 0;
		for (const c of withPhones) {
			const r = await apiFetch('/api/sms/send', {
				method: 'POST',
				body: JSON.stringify({ to: c.phone, body: bulkSmsMsg, contactId: c.id }),
			});
			if (r.ok) sent++; else failed++;
		}

		bulkSmsMsg = '';
		bulkSmsCampaign = null;
		sendingCampaignSms = false;

		toastSuccess(`SMS sent to ${sent} contacts${failed ? `, ${failed} failed` : ''}`);
	}

	async function selectCampaign(c: Campaign) {
		selectedCampaign = c;
		campaignContacts = [];
		campaignListId = null;
		campaignWins = null;
		campaignEmails = [];
		showAddContacts = null;
		showContacts = false;
		contactsLoadedForId = null;
		if (c.id) {
			// Load goals, rep wins, and campaign reply emails eagerly; contacts load lazily
			await Promise.all([loadGoals(c.id), loadCampaignWins(c.id), loadCampaignEmails(c.id), loadCampaignSdrs(c.id)]);
		}
	}

	// Lazy contact loading — fires when showContacts becomes true for the current campaign
	$effect(() => {
		if (showContacts && selectedCampaign && contactsLoadedForId !== selectedCampaign.id) {
			contactsLoadedForId = selectedCampaign.id;
			loadCampaignContacts(selectedCampaign.id);
		}
	});

	let confirmDeleteId = $state<string | null>(null);
	let confirmDeleteContact = $state<string | null>(null); // campaign_contacts.list_contact_id
	let confirmDeleteGoal = $state<string | null>(null);

	// Per-rep win tracking
	let campaignWins = $state<any>(null);
	let loadingWins = $state(false);

	async function loadCampaignWins(campaignId: string) {
		loadingWins = true;
		try {
			const r = await apiFetch(`/api/campaigns/${campaignId}/wins`);
			if (r.ok) campaignWins = await r.json();
		} catch {}
		loadingWins = false;
	}

	// Inbound replies for this campaign
	let campaignEmails = $state<any[]>([]);

	async function loadCampaignEmails(campaignId: string) {
		const r = await apiFetch(`/api/emails?campaign_id=${campaignId}&direction=inbound&limit=20`);
		if (r.ok) {
			const d = await r.json();
			campaignEmails = Array.isArray(d) ? d : (d.data ?? []);
		}
	}

	// Goal templates
	const GOAL_TEMPLATES = [
		{
			name: 'Appointment Setting',
			description: 'Book discovery calls or demos',
			daily_call_goal: 50,
			calls_per_lead: 3,
			cadence_days: 7,
			win_conditions: [
				{ outcome: 'appointment_set', label: 'Appointment Set', weight: 1 },
				{ outcome: 'demo_scheduled', label: 'Demo Scheduled', weight: 1 },
			],
		},
		{
			name: 'Investment Outreach',
			description: 'Identify qualified investors',
			daily_call_goal: 30,
			calls_per_lead: 5,
			cadence_days: 21,
			win_conditions: [
				{ outcome: 'investment_interest', label: 'Investment Interest', weight: 2 },
				{ outcome: 'info_requested', label: 'Requested Info', weight: 1 },
			],
		},
		{
			name: 'Follow-up Blitz',
			description: 'Re-engage warm leads fast',
			daily_call_goal: 80,
			calls_per_lead: 2,
			cadence_days: 3,
			win_conditions: [
				{ outcome: 'callback', label: 'Requested Callback', weight: 1 },
				{ outcome: 'follow_up_agreed', label: 'Agreed to Follow Up', weight: 1 },
			],
		},
		{
			name: 'Cold Outreach',
			description: 'New prospect qualification',
			daily_call_goal: 60,
			calls_per_lead: 4,
			cadence_days: 14,
			win_conditions: [
				{ outcome: 'appointment_set', label: 'Appointment Set', weight: 2 },
				{ outcome: 'follow_up_agreed', label: 'Agreed to Follow Up', weight: 1 },
			],
		},
		{
			name: 'Conversion Push',
			description: 'Close deals in pipeline',
			daily_call_goal: 25,
			calls_per_lead: 6,
			cadence_days: 30,
			win_conditions: [
				{ outcome: 'signed_up', label: 'Signed Up', weight: 3 },
				{ outcome: 'proposal_requested', label: 'Proposal Requested', weight: 1 },
			],
		},
	] as const;

	let showTemplates = $state(false);

	function applyTemplate(template: typeof GOAL_TEMPLATES[number]) {
		newCampaignName = template.name;
		newDailyCallGoal = template.daily_call_goal;
		newCallsPerLead = template.calls_per_lead;
		newCadenceDays = template.cadence_days;
		newWinConditions = [...template.win_conditions];
		showTemplates = false;
		showNewCampaign = true;
	}

	async function deleteCampaign(id: string) {
		const res = await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
		if (res.ok) {
			if (selectedCampaign?.id === id) { selectedCampaign = null; campaignContacts = []; }
			campaigns = campaigns.filter(c => c.id !== id);
		} else {
			toastError('Failed to delete campaign');
		}
		confirmDeleteId = null;
	}

	// Bulk sequence enrollment
	let enrollingSequence = $state(false);
	let enrollResult = $state<{enrolled:number;skipped:number;total:number}|null>(null);

	async function bulkEnrollInSequence() {
		if (!selectedCampaign?.email_sequence_id) return;

		// Get all contacts in campaign
		const r = await apiFetch(`/api/campaigns/${selectedCampaign.id}/contacts?limit=500`);
		if (!r.ok) return;
		const d = await r.json();
		const contacts = d.contacts ?? [];
		const contactIds = contacts.map((c: any) => c.id).filter(Boolean);

		if (contactIds.length === 0) {
			toastError('No contacts in campaign to enroll');
			return;
		}

		enrollingSequence = true;
		enrollResult = null;

		const res = await apiFetch('/api/sequences/enroll-bulk', {
			method: 'POST',
			body: JSON.stringify({
				sequenceId: selectedCampaign.email_sequence_id,
				contactIds,
				campaignId: selectedCampaign.id,
			}),
		});

		if (res.ok) {
			enrollResult = await res.json();
			toastSuccess(`Enrolled ${enrollResult?.enrolled} contacts in sequence`);
		} else {
			toastError('Enrollment failed');
		}
		enrollingSequence = false;
	}
</script>

<svelte:head><title>{titleFor('Campaigns')}</title></svelte:head>
<svelte:window onclick={(e: MouseEvent) => { if (!(e.target as Element)?.closest('.templates-container')) showTemplates = false; }} />

<div class="flex flex-col flex-1 h-full">

	<!-- Review Queue — pending client approval -->
	{#if reviewQueue.length > 0}
		<div class="border-b border-orange-900/30 bg-orange-950/10 px-6 py-3 shrink-0">
			<div class="flex items-center gap-3 mb-2">
				<span class="text-orange-400 text-xs font-semibold uppercase tracking-widest">⏳ Review Queue</span>
				<span class="text-[10px] text-[#7c7c7c]">{reviewQueue.length} campaign{reviewQueue.length !== 1 ? 's' : ''} awaiting your decision</span>
				<span class="text-[10px] text-[#333] ml-auto">Client approved these — activate to start dialing or send back to draft</span>
			</div>
			<div class="flex gap-2 flex-wrap">
				{#each reviewQueue as c}
					<div class="flex items-center gap-2 rounded-lg border border-orange-800/30 bg-[#111] px-3 py-2">
						<div class="min-w-0">
							<p class="text-xs text-white font-medium truncate max-w-[140px]">{c.name}</p>
							<p class="text-[10px] text-[#7c7c7c]">{(c as any).project?.client?.name ?? ''}</p>
						</div>
						<button
							onclick={() => activateCampaign(c.id)}
							disabled={activatingId === c.id}
							class="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hi)] px-3 py-1.5 text-[10px] font-semibold text-[var(--accent-ink)] disabled:opacity-40 transition-colors whitespace-nowrap">
							{activatingId === c.id ? '…' : '▶ Activate'}
						</button>
						<button
							onclick={() => rejectCampaign(c.id)}
							class="rounded-lg border border-[#2a2a2a] px-2 py-1.5 text-[10px] text-[#7c7c7c] hover:text-white transition-colors">
							↩ Draft
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Campaigns</h2>
		<div class="flex items-center gap-2">
			<div class="templates-container relative">
				<button onclick={() => showTemplates = !showTemplates}
					class="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-xs text-[#8a8a8a] hover:border-white hover:text-white transition-colors">
					Templates
				</button>
				{#if showTemplates}
					<div class="absolute right-0 top-full mt-1 bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl py-2 w-72 z-20">
						{#each GOAL_TEMPLATES as tmpl}
							<button onclick={() => applyTemplate(tmpl)}
								class="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#1a1a1a] last:border-0">
								<p class="text-sm text-white font-medium">{tmpl.name}</p>
								<p class="text-xs text-[#7c7c7c] mt-0.5">{tmpl.description} · {tmpl.daily_call_goal} calls/day · {tmpl.calls_per_lead} attempts</p>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<button onclick={() => showNewCampaign = !showNewCampaign}
				class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				+ New Campaign
			</button>
		</div>
	</div>

	{#if showNewCampaign}
		<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] px-8 py-5">
			<div class="max-w-xl">
				<div class="flex gap-3 mb-4">
					<input bind:value={newCampaignName} placeholder="Campaign name"
						class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					<select bind:value={newCampaignProjectId}
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
						<option value="">Select project</option>
						{#each projects as p}
							<option value={p.id}>{p.client?.name} › {p.name}</option>
						{/each}
					</select>
				</div>

				<!-- Campaign type -->
				<div class="mb-4">
					<label class="text-xs text-[#7c7c7c] block mb-2">Campaign Type</label>
					<div class="grid grid-cols-2 gap-2">
						{#each CAMPAIGN_TYPES as ct}
							<button onclick={() => newCampaignType = ct.value}
								class="rounded-lg border p-3 text-left transition-colors {newCampaignType === ct.value ? 'border-white bg-white/5' : 'border-[#2a2a2a] hover:border-[#444]'}">
								<p class="text-sm text-white font-medium">{ct.label}</p>
								<p class="text-xs text-[#7c7c7c] mt-0.5">{ct.desc}</p>
							</button>
						{/each}
					</div>
				</div>

				<!-- Description + goal -->
				<input bind:value={newCampaignDesc} placeholder="Description (optional)"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none mb-2" />
				<input bind:value={newCampaignGoal} placeholder="Goal (e.g. Book 10 demos)"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none mb-2" />

				<!-- Email sequence link (show for email + mixed) -->
				{#if ['email','mixed'].includes(newCampaignType) && sequences.length > 0}
					<div class="mb-2">
						<label class="text-xs text-[#7c7c7c] block mb-1">Linked Email Sequence</label>
						<select bind:value={newSequenceId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
							<option value="">— None —</option>
							{#each sequences as s}<option value={s.id}>{s.name}</option>{/each}
						</select>
					</div>
				{/if}

				<!-- Sender Configuration -->
				<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 space-y-3 mb-3">
					<p class="text-xs text-[#999] uppercase tracking-widest">Sender Configuration</p>
					<p class="text-xs text-[#6e6e6e]">Which email and phone to use for this campaign. Falls back to project defaults if not set.</p>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">From Email</label>
							<select bind:value={newCampaignEmailAccountId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
								<option value="">— Default / Project —</option>
								{#each emailAccounts as acc}
									<option value={acc.id}>{acc.label} ({acc.email_address})</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">From Phone</label>
							<select bind:value={newCampaignPhoneNumberId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
								<option value="">— Default / Primary —</option>
								{#each phoneNumbers as num}
									<option value={num.id}>{num.friendly_name ?? num.phone_number}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

				<!-- Win / Goal Definition -->
				<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 space-y-3 mb-3">
					<p class="text-xs text-[#999] uppercase tracking-widest">What counts as a Win?</p>
					<p class="text-xs text-[#6e6e6e]">Define success for this campaign. Add multiple outcomes — each can have a different weight.</p>

					<!-- Win Conditions Builder -->
					<div class="space-y-2">
						<label class="block text-xs text-[#999] uppercase tracking-widest">Win Conditions</label>
						{#if newWinConditions.length > 0}
							<div class="space-y-1">
								{#each newWinConditions as wc}
									<div class="flex items-center justify-between rounded-lg bg-[#111] border border-[#2a2a2a] px-3 py-2">
										<div class="flex items-center gap-2">
											<span class="text-xs text-white">{wc.label}</span>
											<span class="text-[10px] text-[#7c7c7c]">×{wc.weight}</span>
										</div>
										<button type="button" onclick={() => removeWinCondition(wc.outcome)} class="text-[#6e6e6e] hover:text-red-400 text-xs"><Icon name="x" size={14} /></button>
									</div>
								{/each}
							</div>
						{/if}
						<div class="flex gap-2">
							<select bind:value={addingWinOutcome}
								class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="">Add win outcome…</option>
								{#each OUTCOME_OPTIONS.filter(o => !newWinConditions.find(wc => wc.outcome === o.value)) as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							<div class="flex items-center gap-1 flex-shrink-0">
								<span class="text-xs text-[#7c7c7c]">×</span>
								<input bind:value={addingWinWeight} type="number" min="1" max="5"
									class="w-12 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-sm text-white text-center focus:border-white focus:outline-none" />
							</div>
							<button type="button" onclick={addWinCondition} disabled={!addingWinOutcome}
								class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#8a8a8a] hover:border-white hover:text-white disabled:opacity-40 transition-colors">
								+ Add
							</button>
						</div>
						<p class="text-[10px] text-[#6e6e6e]">Weight = how many wins this outcome counts as (e.g. Signed Up = 2)</p>
					</div>

					<div>
						<label class="text-xs text-[#7c7c7c] block mb-1">Target (optional)</label>
						<div class="flex items-center gap-2">
							<input type="number" bind:value={newTargetWins} placeholder="10" min="1" class="w-24 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							<span class="text-xs text-[#7c7c7c]">wins to achieve this campaign's goal</span>
						</div>
					</div>
				</div>

				<!-- Call Goals & Cadence -->
				<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 space-y-3 mb-3">
					<p class="text-xs text-[#999] uppercase tracking-widest">Call Goals & Cadence</p>
					<div class="grid grid-cols-3 gap-3">
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Daily Call Goal</label>
							<input type="number" bind:value={newDailyCallGoal} placeholder="50"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
							<p class="text-xs text-[#333] mt-1">Calls per day target</p>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Calls Per Lead</label>
							<input type="number" bind:value={newCallsPerLead} min="1" max="20" placeholder="3"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
							<p class="text-xs text-[#333] mt-1">Max attempts per contact</p>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Cadence Window</label>
							<div class="flex items-center gap-1">
								<input type="number" bind:value={newCadenceDays} placeholder="14" min="1" max="90"
									class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
								<span class="text-xs text-[#6e6e6e] shrink-0">days</span>
							</div>
							<p class="text-xs text-[#333] mt-1">Total attempt window</p>
						</div>
					</div>
				</div>

				<div class="flex justify-end mt-3">
					<button onclick={createCampaign} disabled={!newCampaignName.trim() || !newCampaignProjectId}
						class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						Create Campaign
					</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="flex flex-col lg:flex-row flex-1 overflow-hidden">
		<!-- Campaigns list -->
		<div class="{selectedCampaign ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'} w-full lg:w-64 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#1e1e1e] overflow-y-auto">
			{#each campaigns as campaign}
				<button onclick={() => selectCampaign(campaign)}
					class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selectedCampaign?.id === campaign.id ? 'bg-white/10' : 'hover:bg-white/5'}">
					<div class="flex items-center justify-between gap-1.5 mb-0.5">
						<p class="text-sm text-white font-medium truncate flex-1">{campaign.name}</p>
						<div class="flex items-center gap-1 shrink-0">
							<span class="text-[10px] px-1.5 py-0.5 rounded-full {
								(campaign as any).status === 'active' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' :
								(campaign as any).status === 'paused' ? 'bg-yellow-950 text-yellow-600' :
								(campaign as any).status === 'completed' ? 'bg-blue-950 text-blue-400' :
								(campaign as any).status === 'pending_approval' ? 'bg-orange-950 text-orange-400 animate-pulse' :
								'bg-[#1a1a1a] text-[#7c7c7c]'
							}">{(campaign as any).status === 'pending_approval' ? '⏳ awaiting approval' : ((campaign as any).status ?? 'draft')}</span>
							<span class="text-[10px] px-1.5 py-0.5 rounded-full {
								campaign.campaign_type === 'email' ? 'bg-blue-900/30 text-blue-400' :
								campaign.campaign_type === 'sms' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' :
								campaign.campaign_type === 'mixed' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' :
								'bg-[#1a1a1a] text-[#8a8a8a]'
							}">
								{TYPE_ICONS[campaign.campaign_type] ?? '📞'}
							</span>
						</div>
					</div>
					<p class="text-xs text-[#7c7c7c] truncate">{campaign.project?.client?.name} › {campaign.project?.name}</p>
					{#if campaign.target_wins && campaign.win_count !== undefined}
						<p class="text-[10px] text-[#6e6e6e] mt-0.5">{campaign.win_count ?? 0}/{campaign.target_wins} wins</p>
					{:else if (campaign as any).daily_call_goal}
						<p class="text-[10px] text-[#6e6e6e] mt-0.5">{(campaign as any).calls_today ?? 0}/{(campaign as any).daily_call_goal} calls today</p>
					{/if}
				</button>
			{:else}
				<p class="text-center text-[#6e6e6e] text-xs py-8 px-4">No campaigns yet.<br/>Create one above.</p>
			{/each}
		</div>

		<!-- Campaign detail panel -->
		{#if selectedCampaign}
			<div class="flex-1 lg:w-80 lg:min-w-[320px] lg:shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-y-auto">
				<div class="p-4 border-b border-[#1e1e1e]">
					<div class="flex items-center mb-2">
						<button onclick={() => selectedCampaign = null} class="lg:hidden text-xs text-[#7c7c7c] hover:text-white transition-colors mr-3">← Back</button>
						<p class="text-xs text-[#7c7c7c] truncate">{selectedCampaign.project?.client?.name} › {selectedCampaign.project?.name}</p>
					</div>
					<div class="flex items-center gap-2 mb-1">
						<p class="text-white text-sm font-medium">{selectedCampaign.name}</p>
						<span class="shrink-0 text-xs px-2 py-0.5 rounded-full {
							selectedCampaign.campaign_type === 'email' ? 'bg-blue-900/30 text-blue-400' :
							selectedCampaign.campaign_type === 'sms' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' :
							selectedCampaign.campaign_type === 'mixed' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' :
							'bg-[#1a1a1a] text-[#8a8a8a]'
						}">
							{typeLabel(selectedCampaign.campaign_type)}
						</span>
						{#if selectedCampaign.status === 'draft' || selectedCampaign.status === 'paused'}
							<!-- Activate directly OR send to client for approval first -->
							<button onclick={() => activateCampaign(selectedCampaign!.id)}
								disabled={activatingId === selectedCampaign.id}
								class="ml-auto text-xs text-[var(--accent)] hover:text-[var(--accent)] border border-[var(--accent)]/40 px-2.5 py-1 rounded-lg transition-colors shrink-0 disabled:opacity-40">
								▶ Activate Now
							</button>
							<button onclick={async () => {
									const r = await apiFetch(`/api/campaigns/${selectedCampaign!.id}`, { method:'PATCH', body: JSON.stringify({ status:'pending_approval' }) });
									if (r.ok) { const u = await r.json(); campaigns = campaigns.map(c => c.id === u.id ? { ...c, ...u } : c); selectedCampaign = { ...selectedCampaign!, ...u }; toastSuccess('Sent to client for optional approval'); }
									else { toastError('Failed to send for approval'); }
								}}
								class="text-xs text-[#7c7c7c] hover:text-yellow-400 border border-[#2a2a2a] hover:border-yellow-900/40 px-2.5 py-1 rounded-lg transition-colors shrink-0">
								⏳ Send for Client Approval
							</button>
						{/if}
						<button onclick={() => startEditCampaign(selectedCampaign!)}
							class="{selectedCampaign.status === 'draft' || selectedCampaign.status === 'paused' ? '' : 'ml-auto'} text-xs text-[#7c7c7c] hover:text-white border border-[#1e1e1e] px-2.5 py-1 rounded-lg transition-colors shrink-0">
							✎ Edit
						</button>
						{#if confirmDeleteId === selectedCampaign.id}
							<span class="text-xs text-red-400">Sure?</span>
							<button onclick={() => deleteCampaign(selectedCampaign!.id)} class="text-xs text-red-400 hover:text-red-300 ml-1">Yes</button>
							<button onclick={() => confirmDeleteId = null} class="text-xs text-[#7c7c7c] hover:text-white ml-1">No</button>
						{:else}
							<button onclick={() => confirmDeleteId = selectedCampaign!.id} class="text-xs text-red-700 hover:text-red-400 transition-colors shrink-0"><Icon name="x" size={14} /></button>
						{/if}
					</div>

					{#if editingCampaign?.id === selectedCampaign?.id}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 mb-3 space-y-3">
							<input bind:value={campaignEditForm.name} placeholder="Campaign name"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
							<div class="grid grid-cols-2 gap-2">
								<select bind:value={campaignEditForm.campaign_type} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-xs text-white focus:outline-none">
									<option value="call">📞 Call</option>
									<option value="email">✉️ Email</option>
									<option value="sms">💬 SMS</option>
									<option value="mixed">⚡ Mixed</option>
								</select>
								<select bind:value={campaignEditForm.status} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-xs text-white focus:outline-none">
									<option value="active">Active</option>
									<option value="paused">Paused</option>
									<option value="pending_approval">⏳ Pending Client Approval</option>
									<option value="draft">Draft</option>
									<option value="completed">Completed</option>
								</select>
							</div>
							<input bind:value={campaignEditForm.goal} placeholder="Goal (e.g. Book 10 demos)"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
							<textarea bind:value={campaignEditForm.description} placeholder="Description..." rows="2"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none resize-none"></textarea>
							<!-- Goals & Cadence -->
						<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 space-y-3">
							<p class="text-xs text-[#999] uppercase tracking-widest">Call Goals & Cadence</p>
							<div class="grid grid-cols-3 gap-3">
								<div>
									<label class="text-xs text-[#7c7c7c] block mb-1">Daily Call Goal</label>
									<input type="number" bind:value={campaignEditForm.daily_call_goal} placeholder="50" min="1"
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
									<p class="text-xs text-[#333] mt-1">Calls/day target</p>
								</div>
								<div>
									<label class="text-xs text-[#7c7c7c] block mb-1">Max Attempts/Lead</label>
									<input type="number" bind:value={campaignEditForm.calls_per_lead} placeholder="3" min="1" max="20"
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
									<p class="text-xs text-[#333] mt-1">Before moving on</p>
								</div>
								<div>
									<label class="text-xs text-[#7c7c7c] block mb-1">Cadence Window</label>
									<div class="flex items-center gap-1">
										<input type="number" bind:value={campaignEditForm.cadence_days} placeholder="14" min="1" max="90"
											class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
										<span class="text-xs text-[#6e6e6e]">days</span>
									</div>
									<p class="text-xs text-[#333] mt-1">Total attempt window</p>
								</div>
							</div>
							<!-- Win conditions -->
							<div class="pt-2 border-t border-[#1a1a1a] space-y-2">
								<p class="text-xs text-[#7c7c7c] mb-2">Win Conditions</p>
								{#if editWinConditions.length > 0}
									<div class="space-y-1">
										{#each editWinConditions as wc}
											<div class="flex items-center justify-between rounded-lg bg-[#0d0d0d] border border-[#2a2a2a] px-3 py-2">
												<div class="flex items-center gap-2">
													<span class="text-xs text-white">{wc.label}</span>
													<span class="text-[10px] text-[#7c7c7c]">×{wc.weight}</span>
												</div>
												<button type="button" onclick={() => editRemoveWinCondition(wc.outcome)} class="text-[#6e6e6e] hover:text-red-400 text-xs"><Icon name="x" size={14} /></button>
											</div>
										{/each}
									</div>
								{/if}
								<div class="flex gap-2">
									<select bind:value={editAddingWinOutcome}
										class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
										<option value="">Add win outcome…</option>
										{#each OUTCOME_OPTIONS.filter(o => !editWinConditions.find(wc => wc.outcome === o.value)) as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
									<div class="flex items-center gap-1 flex-shrink-0">
										<span class="text-xs text-[#7c7c7c]">×</span>
										<input bind:value={editAddingWinWeight} type="number" min="1" max="5"
											class="w-12 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-sm text-white text-center focus:border-white focus:outline-none" />
									</div>
									<button type="button" onclick={editAddWinCondition} disabled={!editAddingWinOutcome}
										class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#8a8a8a] hover:border-white hover:text-white disabled:opacity-40 transition-colors">
										+ Add
									</button>
								</div>
								<p class="text-[10px] text-[#6e6e6e]">Weight = how many wins this outcome counts as</p>
								<div class="pt-1">
									<label class="text-xs text-[#7c7c7c] block mb-1">Win Target (optional)</label>
									<div class="flex items-center gap-2">
										<input type="number" bind:value={campaignEditForm.target_wins} placeholder="10" min="1"
											class="w-24 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
										<span class="text-xs text-[#7c7c7c]">wins to achieve goal</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Appointment Template Quick-Setup -->
						<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-4 space-y-3">
							<div class="flex items-center justify-between">
								<p class="text-xs text-[var(--accent)] font-medium">📅 Appointment Questions</p>
								<p class="text-[10px] text-[#6e6e6e]">Qualifying questions reps see when booking</p>
							</div>
							<div class="grid grid-cols-3 gap-2">
								{#each [['window_sales','Window Sales'],['roofing','Roofing'],['electrician','Electrician'],['smart_home','Smart Home'],['general','General']] as [key, label]}
									<button onclick={async () => {
										const r = await apiFetch('/api/appointment-templates', { method:'POST', body: JSON.stringify({ campaignId: editingCampaign?.id, name: label.slice(3), questions: [] }) });
										// The template defaults are loaded server-side
										if (r.ok) { toastSuccess('Appointment template set'); }
										else { toastError('Failed to set template'); }
									}} class="rounded-lg border border-[var(--accent)]/40 py-1.5 text-[10px] text-[var(--accent)] hover:bg-[var(--accent-hi)] transition-colors">
										{label}
									</button>
								{/each}
							</div>
							<p class="text-[10px] text-[#333]">Click a template to set it for this campaign. Reps will see these questions in the booking window.</p>
						</div>

						<div class="flex gap-2">
							<button onclick={() => editingCampaign = null} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">Cancel</button>
							<button onclick={saveCampaignEdit} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">Save</button>
						</div>
						</div>
					{/if}

					{#if selectedCampaign.goal}
						<p class="text-xs text-[#6e6e6e] mb-2">🎯 {selectedCampaign.goal}</p>
					{/if}
					{#if selectedCampaign.description}
						<p class="text-xs text-[#7c7c7c] mb-2">{selectedCampaign.description}</p>
					{/if}
					{#if (selectedCampaign as any).daily_call_goal || (selectedCampaign as any).calls_per_lead}
						<div class="flex flex-wrap gap-3 text-xs text-[#7c7c7c] mt-2 mb-2">
							{#if (selectedCampaign as any).daily_call_goal}
								<span>📞 {(selectedCampaign as any).daily_call_goal} calls/day</span>
							{/if}
							{#if (selectedCampaign as any).calls_per_lead && (selectedCampaign as any).calls_per_lead > 1}
								<span>🔄 {(selectedCampaign as any).calls_per_lead} attempts/lead over {(selectedCampaign as any).cadence_days ?? 14} days</span>
							{/if}
						</div>
					{/if}

					<!-- Daily call progress bar -->
					{#if (selectedCampaign as any).daily_call_goal}
						{@const pct = Math.min(100, Math.round(((selectedCampaign as any).calls_today ?? 0) / (selectedCampaign as any).daily_call_goal * 100))}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<div class="flex justify-between text-xs mb-1.5">
								<span class="text-[#999] uppercase tracking-widest">Today</span>
								<span class="text-white font-mono">{(selectedCampaign as any).calls_today ?? 0} / {(selectedCampaign as any).daily_call_goal}</span>
							</div>
							<div class="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
								<div class="h-full rounded-full transition-all duration-500 {pct >= 100 ? 'bg-[var(--accent)]' : pct >= 60 ? 'bg-yellow-500' : 'bg-white/40'}"
									style="width:{pct}%"></div>
							</div>
						</div>
					{/if}

					<!-- Win progress -->
					{#if getWinConditions(selectedCampaign).length > 0 || selectedCampaign.win_count}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<div class="flex items-center justify-between mb-2">
								<p class="text-xs text-[#999] uppercase tracking-widest">Win Progress</p>
								<span class="text-sm font-semibold text-white">
									{selectedCampaign.win_count ?? 0}{#if selectedCampaign.target_wins} / {selectedCampaign.target_wins}{/if}
								</span>
							</div>
							{#if getWinConditions(selectedCampaign).length > 0}
								<div class="flex flex-wrap gap-1 mb-2">
									{#each getWinConditions(selectedCampaign) as wc}
										<span class="text-xs bg-[var(--accent)]/12 text-[var(--accent)] px-2 py-0.5 rounded">{wc.label} ×{wc.weight}</span>
									{/each}
								</div>
							{/if}
							{#if selectedCampaign.target_wins}
								<div class="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
									<div class="h-full rounded-full transition-all duration-500 {
										(selectedCampaign.win_count ?? 0) >= selectedCampaign.target_wins ? 'bg-[var(--accent)]' : 'bg-blue-500'
									}" style="width:{Math.min(((selectedCampaign.win_count ?? 0) / selectedCampaign.target_wins) * 100, 100)}%"></div>
								</div>
								<p class="text-xs text-[#6e6e6e] mt-1">
									{selectedCampaign.target_wins - (selectedCampaign.win_count ?? 0)} remaining to reach goal
								</p>
							{/if}

							{#if loadingWins}
								<p class="text-[10px] text-[#6e6e6e] mt-3">Loading rep data…</p>
							{:else if campaignWins?.byRep?.length > 0}
								<div class="mt-3 pt-3 border-t border-[#1a1a1a]">
									<p class="text-xs text-[#7c7c7c] mb-2">Rep Performance</p>
									<div class="space-y-1.5">
										{#each campaignWins.byRep as rep}
											<div class="flex items-center justify-between">
												<span class="text-xs truncate flex-1 {rep.isCurrentUser ? 'text-white font-medium' : 'text-[#888]'}">{rep.name}</span>
												<div class="flex items-center gap-2 flex-shrink-0 ml-2">
													<span class="text-xs font-mono text-white">{rep.weighted_wins}</span>
													<span class="text-[10px] text-[#6e6e6e]">wins</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Type-specific actions -->
					<div class="flex flex-wrap gap-1.5 mb-3">
						{#if selectedCampaign.campaign_type === 'call' || selectedCampaign.campaign_type === 'mixed'}
							<a href="/dialer?campaign={selectedCampaign.id}" class="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
								📞 Open Dialer
							</a>
						{/if}
						{#if selectedCampaign.campaign_type === 'email' || selectedCampaign.campaign_type === 'mixed'}
							<a href="/sequences{selectedCampaign.email_sequence_id ? '?id=' + selectedCampaign.email_sequence_id : ''}" class="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
								✉️ Email Sequence
							</a>
						{/if}
						{#if selectedCampaign?.email_sequence_id}
							<button onclick={bulkEnrollInSequence} disabled={enrollingSequence}
								class="rounded-lg border border-[var(--c-border-subtle)] px-2.5 py-1 text-xs text-[#8a8a8a] hover:border-white hover:text-white disabled:opacity-40 transition-colors">
								{enrollingSequence ? 'Enrolling...' : '→ Enroll All Contacts'}
							</button>
						{/if}
						{#if selectedCampaign.campaign_type === 'sms' || selectedCampaign.campaign_type === 'mixed'}
							<button onclick={() => openBulkSmsForCampaign(selectedCampaign!)} class="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
								💬 Send SMS
							</button>
						{/if}
					</div>

					{#if enrollResult}
						<p class="text-xs text-[var(--accent)] mb-2">{enrollResult.enrolled} enrolled, {enrollResult.skipped} already active</p>
					{/if}

					<!-- Email blast composer -->
					{#if selectedCampaign && ['email','mixed'].includes(selectedCampaign.campaign_type ?? '')}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<div class="px-8 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
								<p class="text-sm text-white font-medium">Compose & Send</p>
								<button onclick={() => showEmailComposer = !showEmailComposer}
									class="text-xs border border-[#2a2a2a] px-2.5 py-1 rounded-lg text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
									{showEmailComposer ? 'Cancel' : '+ New Email'}
								</button>
							</div>
							{#if showEmailComposer}
								<div class="p-4 space-y-3">
									<!-- Template + AI toolbar -->
									<div class="flex items-center gap-2 flex-wrap">
										<TemplatePicker
											type="email"
											contactName="{{name}}"
											contactCompany="{{company}}"
											onSelect={(subj, bdy) => { emailSubject = subj; emailBody = bdy; }}
										/>
										<button
											onclick={generateCampaignEmail}
											disabled={generatingCampaignEmail}
											class="rounded-lg border border-[var(--accent)]/40 px-2.5 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] disabled:opacity-40 transition-colors">
											{generatingCampaignEmail ? '✨ Writing...' : '✨ AI Write'}
										</button>
										<input bind:value={campaignEmailPrompt} placeholder="Prompt (optional — e.g. 'focus on gaming partnership')"
											class="flex-1 min-w-0 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-[var(--accent)]/40 focus:outline-none" />
									</div>
									<p class="text-xs text-[#6e6e6e]">Use <code class="text-[#7c7c7c]">{'{{name}}'}</code> and <code class="text-[#7c7c7c]">{'{{company}}'}</code> — replaced per contact on send</p>
									<input bind:value={emailSubject} placeholder="Subject line *"
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
									<textarea bind:value={emailBody} rows="6" placeholder="Hi {{name}},&#10;&#10;..."
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
									{#if emailBlastResult}
										<p class="text-xs {emailBlastResult.startsWith('✓') ? 'text-[var(--accent)]' : 'text-yellow-400'}">{emailBlastResult}</p>
									{/if}
									<button onclick={prepareBlast} disabled={sendingEmailBlast || !emailSubject.trim() || !emailBody.trim()}
										class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
										{sendingEmailBlast ? 'Sending...' : 'Send to All Contacts'}
									</button>
								</div>
							{/if}
						</div>
					{/if}

				</div>

					<!-- Assigned Reps -->
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] mb-4">
						<div class="px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
							<div>
								<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.18em;color:var(--c-text-faint)">Assigned Reps</p>
								<p class="text-[10px] text-[#6e6e6e] mt-0.5">SDRs who dial this campaign · {campaignSdrs.length} assigned</p>
							</div>
						</div>
						<div class="divide-y divide-[#111]">
							{#if campaignSdrs.length === 0}
								<p class="px-4 py-3 text-xs text-[#6e6e6e]">No reps assigned — add from your team below</p>
							{:else}
								{#each campaignSdrs as sdr}
									<div class="flex items-center justify-between px-4 py-2.5">
										<div class="flex items-center gap-2">
											<div class="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] text-[#7c7c7c] font-semibold shrink-0">
												{(sdr.team_member?.member_email ?? '?')[0].toUpperCase()}
											</div>
											<span class="text-xs text-white">{sdr.team_member?.member_email?.split('@')[0] ?? '—'}</span>
										</div>
										<button onclick={() => unassignSdr(sdr.sdr_id)}
											class="text-[10px] text-[#333] hover:text-red-400 transition-colors px-1">
											Remove
										</button>
									</div>
								{/each}
							{/if}
						</div>
						{#if teamMembers.filter(m => !campaignSdrs.some(s => s.sdr_id === m.id)).length > 0}
							<div class="px-4 py-3 border-t border-[#111]">
								<p class="text-[9px] text-[#333] mb-2 uppercase tracking-widest">Add rep</p>
								<div class="flex flex-wrap gap-1.5">
									{#each teamMembers.filter(m => !campaignSdrs.some(s => s.sdr_id === m.id)) as member}
										<button onclick={() => assignSdr(member.id)}
											class="rounded-lg border border-[#1e1e1e] px-2.5 py-1 text-[10px] text-[#7c7c7c] hover:border-white hover:text-white transition-colors">
											+ {member.member_email?.split('@')[0]}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Call Lists (contacts) -->
					<div class="flex-1 overflow-y-auto space-y-2">
						{#each selectedCampaign.call_lists ?? [] as list}
							<a href="/call-lists?id={list.id}"
								class="flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors cursor-pointer">
								<div>
									<p class="text-xs text-white font-medium">{list.name}</p>
									<p class="text-[10px] text-[#6e6e6e] mt-0.5">{(list.call_list_contacts?.[0]?.count ?? 0)} contacts</p>
								</div>
								<span class="text-[10px] text-[#333]">→</span>
							</a>
						{:else}
							<div class="rounded-xl border border-dashed border-[#1e1e1e] p-6 text-center">
								<p class="text-xs text-[#6e6e6e]">No call lists yet</p>
								<p class="text-[10px] text-[#333] mt-1">Create a call list to start importing contacts</p>
							</div>
						{/each}
					</div>

				</div>
		{/if}
			</div>
	</div>

