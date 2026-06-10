<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { page } from '$app/stores';
	import { apiFetch } from '$lib/api';
	import TemplatePicker from '$lib/components/TemplatePicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import type { Tag } from '$lib/stores';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	type ContactType = 'lead' | 'prospect' | 'customer' | 'partner' | 'vendor' | 'creator' | 'other';
	type LeadSource = 'cold_call' | 'csv_import' | 'web_scrape' | 'referral' | 'manual' | 'linkedin' | 'website' | 'trade_show' | 'other';

	interface Assoc { id:string; name:string; campaign?:{id:string;name:string;project?:{id:string;name:string;client?:{id:string;name:string}}}; }
	interface Call { id:string; created_at:string; outcome:string|null; summary:string|null; call_duration_seconds:number|null; notes:string|null; recording_url:string|null; }
	interface Contact {
		id:string; name:string; phone:string; email?:string; company:string; title:string;
		status:string; call_count:number; last_called_at?:string;
		contact_type:ContactType; lead_source:LeadSource|null; is_business:boolean;
		notes:string|null; customer_since:string|null; linkedin_url:string|null; website:string|null; do_not_email:boolean;
		contact_score:number|null;
		tags:Tag[]; associations:Assoc[];
	}

	let contact = $state<Contact | null>(null);
	let calls = $state<Call[]>([]);
	let allTags = $state<Tag[]>([]);
	let loading = $state(true);
	let editing = $state(false);
	let saving = $state(false);
	let expandedCall = $state<string|null>(null);
	let contactFlagged = $state(false);
	let flaggingContact = $state(false);
	let enriching = $state(false);
	let enrichment = $state<{ companySummary: string; outreachAngle: string; personalizedMessage: string; talkingPoints: string[] } | null>(null);
	let showEnrichment = $state(false);

	async function enrichContact() {
		enriching = true; showEnrichment = true;
		const res = await apiFetch('/api/scraper', {
			method: 'POST',
			body: JSON.stringify({
				mode: 'enrich',
				contactId: contact!.id,
				contactName: contact!.name,
				contactTitle: contact!.title,
				contactCompany: contact!.company,
			}),
		});
		if (res.ok) {
			const d = await res.json();
			enrichment = d.enrichment ?? d;
		} else {
			enrichment = null;
		}
		enriching = false;
	}

	async function toggleFlag() {
		if (!contact) return;
		flaggingContact = true;
		const res = await apiFetch('/api/contacts/flag-own', { method:'POST', body: JSON.stringify({ contactId: contact.id, flagged: !contactFlagged }) });
		if (res.ok) contactFlagged = !contactFlagged;
		flaggingContact = false;
	}
	type RightTab = 'timeline' | 'calls' | 'sms' | 'email';
	let rightTab = $state<RightTab>('timeline');

	// Timeline
	interface TimelineEvent { type:string; timestamp:string; data:Record<string,unknown>; }
	let timeline = $state<TimelineEvent[]>([]);
	let loadingTimeline = $state(false);

	async function loadTimeline() {
		if (!contact) return;
		loadingTimeline = true;
		const res = await apiFetch(`/api/contacts/timeline?contact_id=${contact.id}`);
		timeline = res.ok ? await res.json() : [];
		loadingTimeline = false;
	}
	// Email tab
	let emails = $state<any[]>([]);
	let loadingEmails = $state(false);
	let selectedEmail = $state<any>(null);
	let showEmailCompose = $state(false);
	let emailSubject = $state('');
	let emailBody = $state('');
	let sendingEmail = $state(false);
	let generatingEmail = $state(false);
	let emailPrompt = $state('');

	async function generateEmail() {
		if (!contact) return;
		generatingEmail = true;
		try {
			const res = await apiFetch('/api/emails/generate', {
				method: 'POST',
				body: JSON.stringify({
					contactId: contact.id,
					contactName: contact.name,
					contactEmail: contact.email,
					contactCompany: contact.company,
					contactType: contact.contact_type,
					contactNotes: contact.notes,
					emailType: 'intro',
					customPrompt: emailPrompt || undefined,
				}),
			});
			if (res.ok) {
				const d = await res.json();
				emailSubject = d.subject;
				emailBody = d.body;
			} else {
				toastError('AI generation failed');
			}
		} catch {
			toastError('AI generation failed');
		}
		generatingEmail = false;
	}

	async function loadEmails() {
		if (!contact) return;
		loadingEmails = true;
		try {
			const r = await apiFetch(`/api/emails?contact_id=${contact.id}&limit=50`);
			if (r.ok) {
				const d = await r.json();
				emails = Array.isArray(d) ? d : (d.data ?? []);
			}
		} catch {}
		loadingEmails = false;
	}

	async function sendEmail() {
		if (!contact?.email || !emailSubject.trim() || !emailBody.trim()) return;
		sendingEmail = true;
		const res = await apiFetch('/api/emails/send', {
			method: 'POST',
			body: JSON.stringify({
				to: contact.email,
				subject: emailSubject,
				html: emailBody.replace(/\n/g, '<br>'),
				text: emailBody,
				contactId: contact.id,
				emailType: 'manual',
			})
		});
		if (res.ok) {
			toastSuccess('Email sent');
			showEmailCompose = false;
			emailSubject = '';
			emailBody = '';
			await loadEmails();
		} else {
			toastError('Failed to send email');
		}
		sendingEmail = false;
	}

	$effect(() => {
		if (rightTab === 'email') loadEmails();
	});

	// SMS
	interface SMS { id:string; body:string; direction:string; status:string; sent_at:string; }
	let smsLogs = $state<SMS[]>([]);
	let smsMessage = $state('');
	let sendingSms = $state(false);

	async function loadSms() {
		if (!contact) return;
		const res = await apiFetch(`/api/sms?contact_id=${contact.id}`);
		smsLogs = res.ok ? await res.json() : [];
	}

	async function applyTemplate(subject: string, body: string, _id: string) {
		smsMessage = body;
	}

	async function sendSms() {
		if (!contact || !smsMessage.trim()) return;
		sendingSms = true;
		try {
			const res = await apiFetch('/api/sms/send', { method: 'POST', body: JSON.stringify({ to: contact.phone, body: smsMessage, contactId: contact.id }) });
			if (res.ok) {
				const log = await res.json();
				smsLogs = [log.log, ...smsLogs];
				smsMessage = '';
				toastSuccess('SMS sent');
			} else {
				toastError('Failed to send SMS');
			}
		} catch {
			toastError('Network error — SMS not sent');
		} finally {
			sendingSms = false;
		}
	}

	// Edit form state
	let edit = $state<Partial<Contact>>({});

	// Tag management
	let addingTag = $state(false);
	let newTagName = $state('');
	let newTagColor = $state('#6366f1');

	const TYPE_LABELS: Record<string, string> = { lead:'Lead', prospect:'Prospect', customer:'Customer', partner:'Partner', vendor:'Vendor', creator:'Creator', other:'Other' };
	const TYPE_COLORS: Record<string, string> = { lead:'text-blue-400', prospect:'text-yellow-400', customer:'text-[var(--accent)]', partner:'text-[var(--accent)]', vendor:'text-[#888]', creator:'text-pink-400', other:'text-[#7c7c7c]' };
	const SOURCE_LABELS: Record<string, string> = { cold_call:'Cold Call', csv_import:'CSV Import', web_scrape:'Web Scrape', referral:'Referral', manual:'Manual Entry', linkedin:'LinkedIn', website:'Website', trade_show:'Trade Show', other:'Other' };
	const OUTCOME_COLORS: Record<string, string> = { answered:'text-[var(--accent)]', voicemail:'text-yellow-400', callback:'text-blue-400', not_interested:'text-[#7c7c7c]', do_not_call:'text-red-400', no_answer:'text-[#6e6e6e]' };

	onMount(async () => {
		const id = $page.params.id;
		const [cr, callsRes, tagsRes] = await Promise.all([
			apiFetch(`/api/contacts/${id}`),
			apiFetch(`/api/calls?contact_id=${id}&limit=50`),
			apiFetch('/api/tags'),
		]);
		if (cr.ok) {
			const raw = await cr.json();
			contactFlagged = raw.flagged_own_pipeline ?? false;
			contact = { ...raw, tags: raw.tags?.map((t: {tag:Tag}) => t.tag).filter(Boolean) ?? [], associations: raw.associations ?? [] };
			edit = { ...contact };
		}
		calls   = callsRes.ok ? await callsRes.json() : [];
		if (contact) { await loadSms(); await loadTimeline(); }
		allTags = tagsRes.ok ? await tagsRes.json() : [];

		// Load associations + lookup lists
		if (contact) await loadAssociations(contact.id);
		const [clRes, camRes, prRes, listRes] = await Promise.all([
			apiFetch('/api/clients'),
			apiFetch('/api/campaigns'),
			apiFetch('/api/projects'),
			apiFetch('/api/call-lists'),
		]);
		allClients = clRes.ok ? (await clRes.json()).map((c: any) => ({id:c.id,name:c.name})) : [];
		allCampaigns = camRes.ok ? (await camRes.json()).map((c: any) => ({id:c.id,name:c.name})) : [];
		allProjects = prRes.ok ? (await prRes.json()).map((c: any) => ({id:c.id,name:c.name})) : [];
		allCallLists = listRes.ok ? (await listRes.json()).map((c: any) => ({id:c.id,name:c.name})) : [];
		loading = false;
	});

	async function saveContact() {
		if (!contact) return;
		saving = true;
		try {
			const res = await apiFetch('/api/contacts/update', { method: 'POST', body: JSON.stringify({ id: contact.id, ...edit }) });
			if (res.ok) {
				const updated = await res.json();
				contact = { ...contact, ...updated };
				edit = { ...contact };
				editing = false;
				toastSuccess('Contact saved');
			} else {
				toastError('Failed to save contact');
			}
		} catch {
			toastError('Network error — contact not saved');
		} finally {
			saving = false;
		}
	}

	async function addTag(tagId: string) {
		if (!contact) return;
		try {
			const res = await apiFetch('/api/contacts/add-tag', { method: 'POST', body: JSON.stringify({ contact_id: contact.id, tag_id: tagId }) });
			if (res.ok) {
				const tag = allTags.find(t => t.id === tagId);
				if (tag) contact = { ...contact, tags: [...contact.tags, tag] };
			} else {
				toastError('Failed to add tag');
			}
		} catch {
			toastError('Network error — tag not added');
		}
	}

	async function removeTag(tagId: string) {
		if (!contact) return;
		try {
			const res = await apiFetch('/api/contacts/remove-tag', { method: 'POST', body: JSON.stringify({ contact_id: contact.id, tag_id: tagId }) });
			if (res.ok) {
				contact = { ...contact, tags: contact.tags.filter(t => t.id !== tagId) };
			} else {
				toastError('Failed to remove tag');
			}
		} catch {
			toastError('Network error — tag not removed');
		}
	}

	async function createAndAddTag() {
		if (!contact || !newTagName.trim()) return;
		addingTag = true;
		const res = await apiFetch('/api/tags', { method: 'POST', body: JSON.stringify({ name: newTagName, color: newTagColor }) });
		if (res.ok) {
			const tag = await res.json();
			allTags = [...allTags, tag];
			await addTag(tag.id);
			newTagName = '';
		}
		addingTag = false;
	}

	function fmtDate(iso?: string | null) { return iso ? new Date(iso).toLocaleDateString() : '—'; }
	function fmtDur(s: number | null) { if (!s) return '—'; return `${Math.floor(s/60)}m ${s%60}s`; }

	const untaggedOptions = $derived(allTags.filter(t => !contact?.tags.find(ct => ct.id === t.id)));

	// ── Associations (clients, campaigns, projects, call lists) ───────────
	interface AssocData {
		clients:   { assocId:string; id:string; name:string }[];
		campaigns: { assocId:string; id:string; name:string; project?:{name:string;client?:{name:string}} }[];
		projects:  { assocId:string; id:string; name:string; client?:{name:string} }[];
		callLists: { assocId:string; id:string; name:string }[];
	}
	let assocData = $state<AssocData>({ clients:[], campaigns:[], projects:[], callLists:[] });
	let allClients = $state<{id:string;name:string}[]>([]);
	let allCampaigns = $state<{id:string;name:string}[]>([]);
	let allProjects = $state<{id:string;name:string}[]>([]);
	let allCallLists = $state<{id:string;name:string}[]>([]);
	let assocPicker = $state<'client'|'campaign'|'project'|'call_list'|null>(null);
	let assocSearchQuery = $state('');

	async function loadAssociations(id: string) {
		const res = await apiFetch(`/api/contacts/associations?contact_id=${id}`);
		if (res.ok) assocData = await res.json();
	}

	async function addAssociation(type: string, targetId: string) {
		if (!contact) return;
		const res = await apiFetch('/api/contacts/associations', {
			method: 'POST',
			body: JSON.stringify({ contactId: contact.id, type, targetId }),
		});
		if (res.ok) { await loadAssociations(contact.id); assocPicker = null; assocSearchQuery = ''; }
	}

	async function removeAssociation(type: string, assocId: string) {
		if (!contact) return;
		await apiFetch(`/api/contacts/associations?type=${type}&assocId=${assocId}`, { method: 'DELETE' });
		await loadAssociations(contact.id);
	}

	// Filtered options for the picker search
	const assocPickerOptions = $derived(() => {
		const q = assocSearchQuery.toLowerCase();
		if (assocPicker === 'client') return allClients.filter(c => c.name.toLowerCase().includes(q));
		if (assocPicker === 'campaign') return allCampaigns.filter(c => c.name.toLowerCase().includes(q));
		if (assocPicker === 'project') return allProjects.filter(c => c.name.toLowerCase().includes(q));
		if (assocPicker === 'call_list') return allCallLists.filter(c => c.name.toLowerCase().includes(q));
		return [];
	});

	// ── Activity logging ────────────────────────────────────────────
	const ACTIVITY_TYPES = [
		{ value: 'note', label: 'Note', icon: '📝' },
		{ value: 'call', label: 'Call', icon: '📞' },
		{ value: 'email', label: 'Email', icon: '✉️' },
		{ value: 'meeting', label: 'Meeting', icon: '📅' },
		{ value: 'demo', label: 'Demo', icon: '🎯' },
		{ value: 'linkedin', label: 'LinkedIn', icon: '💼' },
		{ value: 'text', label: 'Text/SMS', icon: '💬' },
		{ value: 'follow_up', label: 'Follow-up', icon: '🔁' },
		{ value: 'voicemail', label: 'Voicemail Left', icon: '📳' },
		{ value: 'other', label: 'Other', icon: '📌' },
	];

	let showActivityForm = $state(false);
	let activityType = $state('note');
	let activityTitle = $state('');
	let activityDesc = $state('');
	let activityOutcome = $state('');
	let activityDate = $state(new Date().toISOString().slice(0, 16));
	let activityDuration = $state('');
	let savingActivity = $state(false);

	// FIX 1: Re-score contact
	let rescoring = $state(false);
	async function rescore() {
		rescoring = true;
		const res = await apiFetch(`/api/contacts/score`, { method: 'POST', body: JSON.stringify({ contactId: contact!.id }) });
		if (res.ok) { const d = await res.json(); contact = { ...contact!, contact_score: d.score ?? d }; }
		rescoring = false;
	}

	// FIX 3: Create Deal
	let showNewDeal = $state(false);
	let dealForm = $state({ name: '', value: 0, stage: 'prospect', notes: '' });
	let savingDeal = $state(false);

	async function createDeal() {
		if (!dealForm.name.trim()) return;
		savingDeal = true;
		const res = await apiFetch('/api/deals', {
			method: 'POST',
			body: JSON.stringify({
				name: dealForm.name,
				value: dealForm.value,
				stage: dealForm.stage,
				contact_id: contact!.id,
				notes: dealForm.notes
			})
		});
		if (res.ok) { showNewDeal = false; dealForm = { name: '', value: 0, stage: 'prospect', notes: '' }; }
		savingDeal = false;
	}

	async function logActivity() {
		if (!activityDesc.trim() && !activityTitle.trim()) return;
		savingActivity = true;
		const res = await apiFetch('/api/contacts/activities', {
			method: 'POST',
			body: JSON.stringify({
				contactId: contact!.id,
				activityType,
				title: activityTitle.trim() || null,
				description: activityDesc.trim() || null,
				outcome: activityOutcome || null,
				scheduledAt: activityDate || null,
				durationMinutes: activityDuration ? parseInt(activityDuration) : null,
			}),
		});
		if (res.ok) {
			const newActivity = await res.json();
			// Insert into timeline at the top
			timeline = [{ type: 'activity', timestamp: newActivity.scheduled_at ?? newActivity.created_at, data: newActivity }, ...timeline];
			// Reset form
			activityType = 'note'; activityTitle = ''; activityDesc = ''; activityOutcome = ''; activityDuration = '';
			activityDate = new Date().toISOString().slice(0, 16);
			showActivityForm = false;
			toastSuccess('Activity logged');
		} else {
			const body = await res.text().catch(() => '');
			toastError(`Failed to log activity${body ? ': ' + body.slice(0, 80) : ''}`);
		}
		savingActivity = false;
	}
</script>

<svelte:head><title>{contact?.name ?? 'Contact'} — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	{#if loading}
		<div class="flex items-center justify-center h-full"><p class="text-[#6e6e6e] text-sm">Loading...</p></div>
	{:else if contact}
		<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-3">
			<a href="/contacts" class="text-xs text-[#7c7c7c] hover:text-white transition-colors">← Contacts</a>
			<span class="text-[#333]">/</span>
			<p class="text-white text-sm font-medium">{contact.name}</p>
		</div>

		<div class="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
			<!-- Left: profile + tags + associations -->
			<div class="w-full lg:w-80 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#1e1e1e] overflow-y-auto p-5 space-y-5">

				<!-- Type + Source badges -->
				<div class="flex flex-wrap gap-2">
					<span class="px-2 py-1 rounded-full text-xs font-medium bg-white/5 {TYPE_COLORS[contact.contact_type] ?? 'text-[#8a8a8a]'}">
						{TYPE_LABELS[contact.contact_type] ?? contact.contact_type}
					</span>
					{#if contact.is_business}
						<span class="px-2 py-1 rounded-full text-xs bg-[var(--accent)]/12 text-[var(--accent)]">B2B</span>
					{/if}
					{#if contact.lead_source}
						<span class="px-2 py-1 rounded-full text-xs bg-[#1a1a1a] text-[#8a8a8a]">{SOURCE_LABELS[contact.lead_source] ?? contact.lead_source}</span>
					{/if}
					{#if contact.do_not_email}
						<span class="px-2 py-1 rounded-full text-xs bg-red-900/20 text-red-500">No Email</span>
					{/if}
				</div>

				<!-- Quick actions -->
				<div class="flex gap-2">
					<a href="/phone?number={encodeURIComponent(contact.phone)}"
						class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black text-center hover:bg-[#e5e5e5] transition-colors">
						Call
					</a>
					<button onclick={() => editing = !editing}
						class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
						{editing ? 'Cancel' : 'Edit'}
					</button>
					<button onclick={enrichContact}
						class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
						✨ Enrich
					</button>
					<button onclick={() => showNewDeal = !showNewDeal}
						class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
						💰 Deal
					</button>
				</div>

				<!-- Enrichment panel -->
				{#if showEnrichment}
					<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-4">
						<div class="flex items-center justify-between mb-3">
							<p class="text-sm text-[var(--accent)] font-medium">✨ AI Enrichment</p>
							<button onclick={() => showEnrichment = false} class="text-xs text-[#6e6e6e] hover:text-white"><Icon name="x" size={14} /></button>
						</div>
						{#if enriching}
							<div class="flex items-center gap-2 text-xs text-[#7c7c7c]">
								<div class="w-3 h-3 rounded-full bg-[var(--accent)] animate-bounce"></div>
								Enriching contact data...
							</div>
						{:else if enrichment}
							<div class="space-y-3 text-xs">
								{#if enrichment.companySummary}
									<div><p class="text-[#7c7c7c] uppercase tracking-widest mb-1">Company</p><p class="text-[#ccc]">{enrichment.companySummary}</p></div>
								{/if}
								{#if enrichment.outreachAngle}
									<div><p class="text-[#7c7c7c] uppercase tracking-widest mb-1">Best Approach</p><p class="text-[#ccc]">{enrichment.outreachAngle}</p></div>
								{/if}
								{#if enrichment.personalizedMessage}
									<div><p class="text-[#7c7c7c] uppercase tracking-widest mb-1">Opening Line</p><p class="text-[var(--accent)] italic">"{enrichment.personalizedMessage}"</p></div>
								{/if}
								{#if enrichment.talkingPoints?.length}
									<div>
										<p class="text-[#7c7c7c] uppercase tracking-widest mb-1">Talking Points</p>
										<ul class="space-y-1">
											{#each enrichment.talkingPoints as point}
												<li class="text-[#888]">• {point}</li>
											{/each}
										</ul>
									</div>
								{/if}
								<button onclick={enrichContact} class="text-xs text-[var(--accent)] underline">Regenerate</button>
							</div>
						{:else}
							<p class="text-xs text-red-400">Enrichment failed — make sure ANTHROPIC_API_KEY is set</p>
						{/if}
					</div>
				{/if}

				<!-- FIX 3: New Deal panel -->
				{#if showNewDeal}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<div class="flex items-center justify-between">
							<p class="text-sm text-white font-medium">New Deal</p>
							<button onclick={() => showNewDeal = false} class="text-xs text-[#6e6e6e] hover:text-white"><Icon name="x" size={14} /></button>
						</div>
						<input bind:value={dealForm.name} placeholder="Deal name *" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<div class="grid grid-cols-2 gap-2">
							<input type="number" bind:value={dealForm.value} placeholder="Value ($)" class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							<select bind:value={dealForm.stage} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
								{#each ['prospect','qualified','demo','proposal','negotiation'] as s}
									<option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
								{/each}
							</select>
						</div>
						<button onclick={createDeal} disabled={savingDeal || !dealForm.name.trim()} class="w-full rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
							{savingDeal ? 'Creating...' : 'Create Deal'}
						</button>
					</div>
				{/if}

				{#if editing}
					<!-- Edit form -->
					<div class="space-y-3">
						{#each [['name','Name'],['phone','Phone'],['email','Email'],['company','Company'],['title','Title'],['linkedin_url','LinkedIn URL'],['website','Website']] as [f, l]}
							<div>
								<label class="text-xs text-[#7c7c7c] block mb-1">{l}</label>
								<input value={(edit as Record<string,unknown>)[f] as string ?? ''} oninput={(e) => { (edit as Record<string,unknown>)[f] = (e.target as HTMLInputElement).value; }}
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
							</div>
						{/each}
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Contact Type</label>
							<select bind:value={edit.contact_type} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								{#each Object.entries(TYPE_LABELS) as [v, l]}<option value={v}>{l}</option>{/each}
							</select>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Lead Source</label>
							<select bind:value={edit.lead_source} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="">Unknown</option>
								{#each Object.entries(SOURCE_LABELS) as [v, l]}<option value={v}>{l}</option>{/each}
							</select>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Status</label>
							<select bind:value={edit.status} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="active">Active</option>
								<option value="do_not_call">Do Not Call</option>
								<option value="archived">Archived</option>
							</select>
						</div>
						<div class="flex gap-4">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="checkbox" bind:checked={edit.is_business} />
								<span class="text-xs text-white">B2B</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="checkbox" bind:checked={edit.do_not_email} />
								<span class="text-xs text-white">No Email</span>
							</label>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Customer Since</label>
							<DatePicker bind:value={edit.customer_since} onchange={(v) => edit.customer_since = v} />
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">Notes</label>
							<textarea bind:value={edit.notes} rows="3"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none resize-none"></textarea>
						</div>
						<button onclick={saveContact} disabled={saving} class="w-full rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
							{saving ? 'Saving...' : 'Save Changes'}
						</button>
					</div>
				{:else}
					<!-- Profile display -->
					<div class="space-y-3">
						{#each [
							['Name', contact.name],
							['Phone', contact.phone],
							['Email', contact.email],
							['Company', contact.company],
							['Title', contact.title],
							['Status', contact.status],
							['Calls Made', contact.call_count.toString()],
							['Last Called', fmtDate(contact.last_called_at)],
							['Customer Since', fmtDate(contact.customer_since)],
							['LinkedIn', contact.linkedin_url],
							['Website', contact.website],
						] as [label, value]}
							{#if value}
								<div>
									<p class="text-xs text-[#7c7c7c] mb-0.5">{label}</p>
									{#if label === 'LinkedIn' || label === 'Website'}
										<a href={value} target="_blank" class="text-sm text-blue-400 hover:underline truncate block">{value}</a>
									{:else}
										<p class="text-sm text-white">{value}</p>
									{/if}
								</div>
							{/if}
						{/each}
						{#if contact.notes}
							<div>
								<p class="text-xs text-[#7c7c7c] mb-0.5">Notes</p>
								<p class="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
							</div>
						{/if}
						<!-- FIX 1: Contact score bar -->
						<div>
							<p class="text-xs text-[#7c7c7c] mb-1">Score</p>
							<div class="flex items-center gap-2 mt-1">
								<div class="flex-1 bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
									<div class="h-full rounded-full transition-all duration-500 {(contact.contact_score ?? 0) > 70 ? 'bg-[var(--accent)]' : (contact.contact_score ?? 0) > 40 ? 'bg-yellow-500' : 'bg-[#333]'}" style="width:{Math.min(contact.contact_score ?? 0, 100)}%"></div>
								</div>
								<span class="text-xs text-[#7c7c7c] w-8 text-right">{contact.contact_score ?? '—'}</span>
								<button onclick={rescore} disabled={rescoring} class="text-xs text-[#6e6e6e] hover:text-white transition-colors" title="Re-score contact">{rescoring ? '...' : '↺'}</button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Tags -->
				<div>
					<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-2">Tags</p>
					<div class="flex flex-wrap gap-1.5 mb-3">
						{#each contact.tags as tag}
							<span class="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
								style="background-color:{tag.color}20;color:{tag.color};border:1px solid {tag.color}40">
								{tag.name}
								<button onclick={() => removeTag(tag.id)} class="hover:opacity-60"><Icon name="x" size={14} /></button>
							</span>
						{/each}
					</div>
					<!-- Add existing tag -->
					{#if untaggedOptions.length > 0}
						<select onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) { addTag(v); (e.target as HTMLSelectElement).value = ''; }}}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none mb-2">
							<option value="">+ Add tag...</option>
							{#each untaggedOptions as t}<option value={t.id}>{t.name}</option>{/each}
						</select>
					{/if}
					<!-- Create new tag -->
					<div class="flex gap-1.5">
						<input bind:value={newTagName} placeholder="New tag name" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<input type="color" bind:value={newTagColor} class="w-8 h-7 rounded border border-[#2a2a2a] bg-[#1a1a1a] cursor-pointer" />
						<button onclick={createAndAddTag} disabled={addingTag || !newTagName.trim()} class="rounded bg-white px-2 py-1 text-xs font-bold text-black disabled:opacity-40">+</button>
					</div>
				</div>

				<!-- Associations -->
				{#if contact.associations?.length}
					<div>
						<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-2">In Call Lists</p>
						<div class="space-y-1.5">
							{#each contact.associations as assoc}
								<div class="rounded-lg bg-[#1a1a1a] border border-[#1e1e1e] px-3 py-2">
									<p class="text-xs text-white">{assoc.name}</p>
									{#if assoc.campaign}
										<p class="text-xs text-[#7c7c7c] truncate">
											{assoc.campaign.project?.client?.name ?? ''} › {assoc.campaign.name}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Right: activity + calls + sms -->
			<div class="flex-1 flex flex-col overflow-hidden min-h-[400px] lg:min-h-0">
				<!-- Tab bar -->
				<div class="border-b border-[#1e1e1e] px-4 flex shrink-0">
					{#each [['timeline','Timeline'],['calls',`Calls (${calls.length})`],['sms','SMS']] as [tab, label]}
						<button
							onclick={() => rightTab = tab as RightTab}
							class="px-4 py-3 text-xs border-b-2 transition-colors {rightTab === tab ? 'border-white text-white' : 'border-transparent text-[#7c7c7c] hover:text-[#999]'}"
						>{label}</button>
					{/each}
					<button
						onclick={() => rightTab = 'email'}
						class="px-3 py-2 text-xs font-medium transition-colors border-b-2 {rightTab === 'email' ? 'border-white text-white' : 'border-transparent text-[#7c7c7c] hover:text-[#888]'}">
						Email {emails.length > 0 ? `(${emails.length})` : ''}
					</button>
				</div>
				<div class="flex-1 overflow-y-auto">
				{#if rightTab === 'timeline'}
				<!-- Timeline header with Add button -->
				<div class="flex items-center justify-between px-8 py-4 border-b border-[#1a1a1a]">
					<p class="text-xs text-[#7c7c7c] uppercase tracking-widest">Activity</p>
					<button onclick={() => showActivityForm = !showActivityForm}
						class="text-xs border border-[#2a2a2a] px-3 py-1 rounded-lg text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
						{showActivityForm ? '✕ Cancel' : '+ Log Activity'}
					</button>
				</div>

			{#if showActivityForm}
				<div class="px-4 py-3 border-b border-[#1a1a1a] bg-[#0d0d0d] space-y-3">
					<!-- Type pills -->
					<div class="flex flex-wrap gap-1.5">
						{#each ACTIVITY_TYPES as t}
							<button onclick={() => activityType = t.value}
								class="px-2.5 py-1 rounded-full text-xs transition-colors {activityType === t.value ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#8a8a8a] hover:border-[#555] hover:text-[#ccc]'}">
								{t.icon} {t.label}
							</button>
						{/each}
					</div>

					<input bind:value={activityTitle} placeholder="Title (optional)"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />

					<textarea bind:value={activityDesc} placeholder="What happened? Notes, outcome, next steps..." rows="3"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"
						onkeydown={(e) => { if (e.key === 'Enter' && e.metaKey) logActivity(); }}></textarea>

					<div class="flex gap-2">
						<input type="datetime-local" bind:value={activityDate}
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none" />
						{#if ['call','meeting','demo'].includes(activityType)}
							<input type="number" bind:value={activityDuration} placeholder="Min" min="1"
								class="w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
						{/if}
					</div>

					<button onclick={logActivity} disabled={savingActivity || (!activityDesc.trim() && !activityTitle.trim())}
						class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						{savingActivity ? 'Saving...' : 'Log Activity'}
					</button>
				</div>
			{/if}

			<div class="p-5 space-y-3">
				{#if loadingTimeline}
					<p class="text-[#6e6e6e] text-xs text-center py-6">Loading...</p>
				{:else if timeline.length === 0}
					<p class="text-[#6e6e6e] text-xs text-center py-8">No activity yet</p>
				{:else}
					{#each timeline as event}
						<div class="flex gap-3 group">
							<div class="w-7 h-7 rounded-full border border-[#2a2a2a] bg-[#1a1a1a] flex items-center justify-center text-sm shrink-0 mt-0.5">
								{event.type === 'call' ? '📞' : event.type === 'sms' ? '💬' : event.type === 'email' ? '✉️' : event.type === 'task' ? '✓' : event.type === 'deal' ? '💼' : event.type === 'activity' ? (ACTIVITY_TYPES.find(t => t.value === event.data.activity_type)?.icon ?? '📌') : '·'}
							</div>
							<div class="flex-1 min-w-0">
								{#if event.type === 'call'}
									<p class="text-sm text-white capitalize">{(event.data.outcome as string ?? '').replace(/_/g,' ') || 'Call'}</p>
									{#if event.data.summary}<p class="text-xs text-[#8a8a8a] mt-0.5 truncate">{event.data.summary as string}</p>{/if}
								{:else if event.type === 'sms'}
									<p class="text-sm text-white">{event.data.direction === 'outbound' ? 'SMS sent' : 'SMS received'}</p>
									<p class="text-xs text-[#8a8a8a] truncate">{event.data.body as string}</p>
								{:else if event.type === 'email'}
									<p class="text-sm text-white">{event.data.subject as string}</p>
									<p class="text-xs text-[#8a8a8a]">{event.data.status as string}</p>
								{:else if event.type === 'task'}
									<p class="text-sm text-white {event.data.status === 'completed' ? 'line-through text-[#7c7c7c]' : ''}">{event.data.title as string}</p>
									<p class="text-xs text-[#8a8a8a] capitalize">{(event.data.task_type as string)?.replace(/_/g,' ')} · {event.data.status as string}</p>
								{:else if event.type === 'deal'}
									<p class="text-sm text-white">{event.data.title as string}</p>
									<p class="text-xs text-[#8a8a8a] capitalize">{event.data.stage as string} · ${event.data.value as number}</p>
								{:else if event.type === 'activity'}
									<div class="flex items-center gap-2 flex-wrap">
										<span class="text-xs font-medium text-white capitalize">{(event.data.activity_type as string).replace('_', ' ')}</span>
										{#if event.data.title}<span class="text-xs text-[#888]">— {event.data.title as string}</span>{/if}
										{#if event.data.duration_minutes}<span class="text-xs text-[#7c7c7c]">{event.data.duration_minutes as number}min</span>{/if}
										{#if event.data.outcome}<span class="text-xs px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#888]">{event.data.outcome as string}</span>{/if}
									</div>
									{#if event.data.description}<p class="text-xs text-[#9a9a9a] mt-1 whitespace-pre-wrap">{event.data.description as string}</p>{/if}
								{/if}
								<p class="text-xs text-[#333] mt-0.5">{new Date(event.timestamp).toLocaleString()}</p>
							</div>
						</div>
					{/each}
				{/if}
			</div>
			{:else if rightTab === 'sms'}
			<div class="flex flex-col">
				<div class="flex-1 overflow-y-auto p-4 space-y-2">
					{#if smsLogs.length === 0}
						<p class="text-[#6e6e6e] text-sm text-center py-8">No messages yet</p>
					{:else}
						{#each smsLogs as sms}
							<div class="flex {sms.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
								<div class="max-w-xs rounded-xl px-3 py-2 {sms.direction === 'outbound' ? 'bg-white/10 text-white' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#ccc]'}">
									<p class="text-sm">{sms.body}</p>
									<p class="text-xs mt-1 {sms.direction === 'outbound' ? 'text-white/40' : 'text-[#6e6e6e]'}">{new Date(sms.sent_at).toLocaleTimeString()}</p>
								</div>
							</div>
						{/each}
					{/if}
				</div>
				<div class="border-t border-[#1e1e1e] p-4 space-y-3">
					<div class="flex gap-2 items-end">
						<textarea
							bind:value={smsMessage}
							placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									sendSms();
								}
							}}
							rows="2"
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"
						></textarea>
						<button onclick={sendSms} disabled={sendingSms || !smsMessage.trim()}
							class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors self-end">
							{sendingSms ? '...' : 'Send'}
						</button>
					</div>
					<TemplatePicker type="sms" onSelect={applyTemplate} contactName={contact?.name ?? ''} />
				</div>
			</div>
			{:else if rightTab === 'calls'}
			<div class="p-4 space-y-3">
				{#if calls.length === 0}
					<p class="text-[#6e6e6e] text-sm text-center py-8">No calls logged yet</p>
				{:else}
					{#each calls as call}
						<div class="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] p-3 space-y-1.5">
							<div class="flex items-center justify-between gap-2">
								<p class="text-sm text-white capitalize">{(call.outcome ?? '').replace(/_/g,' ') || 'Call'}</p>
								<span class="text-xs text-[#6e6e6e] shrink-0">{new Date(call.created_at).toLocaleString()}</span>
							</div>
							{#if call.call_duration_seconds}
								<p class="text-xs text-[#7c7c7c]">Duration: {Math.floor(call.call_duration_seconds / 60)}m {call.call_duration_seconds % 60}s</p>
							{/if}
							{#if call.summary}<p class="text-xs text-[#888] whitespace-pre-wrap">{call.summary}</p>{/if}
							{#if call.notes}<p class="text-xs text-[#8a8a8a] whitespace-pre-wrap">{call.notes}</p>{/if}
							{#if call.recording_url}
								<audio controls preload="none" src={call.recording_url} class="w-full h-8 mt-1"></audio>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
			{:else if rightTab === 'email'}
			<div class="flex flex-col">
				<div class="border-b border-[#1e1e1e] p-4 space-y-2">
					{#if !contact?.email}
						<p class="text-xs text-yellow-600/80">This contact has no email address — add one to send email.</p>
					{/if}
					<div class="flex gap-2">
						<input bind:value={emailPrompt} placeholder="Optional: tell the AI what to write about…"
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<button onclick={generateEmail} disabled={generatingEmail || !contact}
							class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-3 py-2 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] disabled:opacity-40 transition-colors shrink-0">
							{generatingEmail ? 'Writing…' : '✨ Draft with AI'}
						</button>
					</div>
					<input bind:value={emailSubject} placeholder="Subject"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					<textarea bind:value={emailBody} placeholder="Write your email…" rows="6"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
					<button onclick={sendEmail} disabled={sendingEmail || !contact?.email || !emailSubject.trim() || !emailBody.trim()}
						class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
						{sendingEmail ? 'Sending…' : 'Send Email'}
					</button>
				</div>
				<div class="flex-1 overflow-y-auto p-4 space-y-2">
					{#if loadingEmails}
						<p class="text-[#6e6e6e] text-sm text-center py-8">Loading…</p>
					{:else if emails.length === 0}
						<p class="text-[#6e6e6e] text-sm text-center py-8">No emails yet</p>
					{:else}
						{#each emails as email}
							<div class="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] p-3 space-y-1">
								<div class="flex items-center justify-between gap-2">
									<p class="text-sm text-white truncate">{email.subject ?? '(no subject)'}</p>
									<span class="text-xs text-[#6e6e6e] shrink-0">{email.created_at ? new Date(email.created_at).toLocaleDateString() : ''}</span>
								</div>
								<p class="text-xs text-[#7c7c7c] capitalize">{email.direction ?? 'outbound'} · {email.status ?? 'sent'}</p>
							</div>
						{/each}
					{/if}
				</div>
			</div>
{/if}
</div>
</div>
</div>
{/if}
</div>
