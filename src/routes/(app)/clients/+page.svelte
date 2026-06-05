<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface CallList { id: string; name: string; status: string; }
	interface Project { id: string; name: string; call_lists: CallList[]; }
	interface Client {
		id: string; name: string; projects: Project[];
		website?: string; industry?: string; description?: string; logo_url?: string;
		primary_contact_name?: string; primary_contact_email?: string; primary_contact_phone?: string;
		linkedin_url?: string; contract_value?: number; contract_status?: string;
		tags?: string[]; timezone?: string; notes?: string;
	}

	let clients = $state<Client[]>([]);
	let selected = $state<Client | null>(null);
	let newClientName = $state('');
	let newProjectName = $state('');

	// Engagement / compensation
	interface Engagement { id: string; base_fee: number; bonus_rate: number; billing_day: number; notes: string | null; sdr_user_id: string | null; }
	let engagements = $state<Engagement[]>([]);
	let showEngForm = $state(false);
	let engBaseFee = $state('');
	let engBonusRate = $state('50');
	let engBillingDay = $state('1');
	let engNotes = $state('');
	let savingEng = $state(false);

	async function loadEngagements(clientId: string) {
		const r = await apiFetch(`/api/engagements?client_id=${clientId}`);
		if (r.ok) engagements = await r.json();
	}

	async function saveEngagement() {
		if (!selected) return;
		savingEng = true;
		const res = await apiFetch('/api/engagements', {
			method: 'POST',
			body: JSON.stringify({
				clientId: selected.id,
				baseFee: parseInt(engBaseFee) || 0,
				bonusRate: parseInt(engBonusRate) || 50,
				billingDay: parseInt(engBillingDay) || 1,
				notes: engNotes || undefined,
			}),
		});
		if (res.ok) {
			await loadEngagements(selected.id);
			showEngForm = false;
			toastSuccess('Engagement saved');
		} else {
			toastError('Failed to save engagement');
		}
		savingEng = false;
	}

	async function deleteEngagement(id: string) {
		const res = await apiFetch(`/api/engagements?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			engagements = engagements.filter(e => e.id !== id);
			toastSuccess('Engagement removed');
		} else {
			toastError('Failed to remove engagement');
		}
	}

	// Client docs
	interface ClientDoc { id: string; title: string; doc_type: string; url: string; description: string | null; is_visible_to_client: boolean; from_client: boolean; submitted_by_name: string | null; created_at: string; }
	let docs = $state<ClientDoc[]>([]);
	let showDocForm = $state(false);
	let docTitle = $state(''); let docUrl = $state(''); let docType = $state('file'); let docDesc = $state(''); let docVisible = $state(true);
	let savingDoc = $state(false);

	const DOC_TYPES = ['file','pdf','contract','sow','brief','link','asset'];
	const clientSubmitted = $derived(docs.filter(d => d.from_client));
	const adminDocs = $derived(docs.filter(d => !d.from_client));

	async function loadDocs(clientId: string) {
		const r = await apiFetch(`/api/client-docs?client_id=${clientId}`);
		if (r.ok) docs = await r.json();
	}
	async function saveDoc() {
		if (!selected || !docTitle.trim() || !docUrl.trim()) return;
		savingDoc = true;
		const res = await apiFetch('/api/client-docs', {
			method: 'POST',
			body: JSON.stringify({ clientId: selected.id, title: docTitle.trim(), url: docUrl.trim(), docType, description: docDesc || undefined, isVisibleToClient: docVisible }),
		});
		if (res.ok) { await loadDocs(selected.id); docTitle = ''; docUrl = ''; docDesc = ''; showDocForm = false; toastSuccess('Document added'); }
		else { toastError('Failed to add document'); }
		savingDoc = false;
	}
	async function deleteDoc(id: string) {
		if (!confirm('Delete this document? This cannot be undone.')) return;
		const res = await apiFetch(`/api/client-docs?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			docs = docs.filter(d => d.id !== id);
			toastSuccess('Document deleted');
		} else {
			toastError('Failed to delete document');
		}
	}

	// Client profile edit
	let editingClient = $state(false);
	let clientEdit = $state<Partial<Client>>({});

	function startEditClient() {
		editingClient = true;
		clientEdit = { ...selected };
	}

	async function saveClientEdit() {
		if (!selected) return;
		const res = await apiFetch(`/api/clients/${selected.id}`, {
			method: 'PATCH',
			body: JSON.stringify(clientEdit),
		});
		if (res.ok) {
			const updated = await res.json();
			selected = { ...selected, ...updated };
			clients = clients.map(c => c.id === selected!.id ? { ...c, ...updated } : c);
			editingClient = false;
			toastSuccess('Profile saved');
		} else {
			toastError('Failed to save profile');
		}
	}

	// AI Insights
	let insights = $state<string | null>(null);
	let loadingInsights = $state(false);
	let showInsights = $state(false);

	async function getInsights() {
		if (!selected) return;
		loadingInsights = true; showInsights = true;
		const res = await apiFetch(`/api/clients/${selected.id}/insights`);
		if (res.ok) { const d = await res.json(); insights = d.insights; }
		else insights = 'Could not generate insights. Try again.';
		loadingInsights = false;
	}

	// Knowledge Base Q&A
	let kbQuestion = $state('');
	let askingKb = $state(false);
	let kbHistory = $state<{role:string;content:string}[]>([]);
	let showKbChat = $state(false);

	// Knowledge add form
	let kTitle = $state('');
	let kType = $state('general');
	let kContent = $state('');
	let savingK = $state(false);

	const K_TYPES: Record<string,string> = {
		brand_voice: '🎤 Brand Voice & Tone',
		icp: '🎯 Ideal Customer Profile',
		product: '📦 Product & Service',
		talking_points: '💬 Key Talking Points',
		objections: '🛡 Objection Handlers',
		pricing: '💰 Pricing',
		materials: '📎 Materials & Links',
		general: '📋 General Notes',
		custom: '✏️ Custom',
	};

	async function saveKnowledge() {
		if (!selected || !kTitle.trim() || !kContent.trim()) return;
		savingK = true;
		const res = await apiFetch('/api/client-knowledge', {
			method: 'POST',
			body: JSON.stringify({ clientId: selected.id, title: kTitle.trim(), content: kContent.trim(), knowledgeType: kType }),
		});
		if (res.ok) {
			const item = await res.json();
			knowledge = [...knowledge, item];
			kTitle = ''; kContent = ''; kType = 'general';
			toastSuccess('Knowledge added');
		} else {
			toastError('Failed to add knowledge');
		}
		savingK = false;
	}

	async function askKb() {
		if (!kbQuestion.trim() || !selected) return;
		askingKb = true;
		const q = kbQuestion;
		kbQuestion = '';
		kbHistory = [...kbHistory, { role: 'user', content: q }];

		// Add empty assistant message that fills as stream comes in
		kbHistory = [...kbHistory, { role: 'assistant', content: '' }];
		const lastIdx = kbHistory.length - 1;

		try {
			const res = await apiFetch(`/api/clients/${selected.id}/ask`, {
				method: 'POST',
				body: JSON.stringify({ question: q, conversationHistory: kbHistory.slice(-12, -1) })
			});

			if (!res.ok || !res.body) {
				kbHistory = kbHistory.map((m, i) => i === lastIdx ? { ...m, content: 'Error reaching AI.' } : m);
				askingKb = false;
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let text = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				text += decoder.decode(value, { stream: true });
				// Reactively update the last message as chunks arrive
				kbHistory = kbHistory.map((m, i) => i === lastIdx ? { ...m, content: text } : m);
			}
		} catch {
			kbHistory = kbHistory.map((m, i) => i === lastIdx ? { ...m, content: 'Network error.' } : m);
		}
		askingKb = false;
	}
	// Knowledge base state — loaded reactively when selected changes
	interface KnowledgeItem { id: string; title: string; knowledge_type: string; content: string; }
	let knowledge = $state<KnowledgeItem[]>([]);
	let expandedK = $state<string | null>(null);
	let knowledgeController: AbortController | null = null;

	$effect(() => {
		if (selected) {
			knowledgeController?.abort();
			knowledgeController = new AbortController();
			knowledge = [];
			expandedK = null;
			loadKnowledge(selected.id);
		} else {
			knowledge = [];
			expandedK = null;
		}
	});

	async function loadKnowledge(clientId: string) {
		try {
			const r = await apiFetch(`/api/client-knowledge?client_id=${clientId}`);
			if (r.ok) knowledge = await r.json();
		} catch {
			knowledge = [];
		}
	}

	async function deleteKnowledge(id: string) {
		if (!confirm('Delete this knowledge entry? This cannot be undone.')) return;
		const res = await apiFetch(`/api/client-knowledge/${id}`, { method: 'DELETE' });
		if (res.ok) {
			knowledge = knowledge.filter(k => k.id !== id);
			if (expandedK === id) expandedK = null;
			toastSuccess('Knowledge deleted');
		} else {
			toastError('Failed to delete knowledge');
		}
	}

	let newProjectClientId = $state('');
	let adding = $state(false);

	onMount(load);

	async function load() {
		try {
			const res = await apiFetch('/api/clients');
			clients = res.ok ? await res.json() : [];
		} catch {
			clients = [];
		}
	}

	async function createClient() {
		if (!newClientName.trim()) return;
		adding = true;
		const _clientName = newClientName;
		const res = await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify({ name: newClientName }) });
		newClientName = '';
		adding = false;
		if (res.ok) { toastSuccess(`${_clientName} added`); }
		else { toastError('Failed to create client'); }
		await load();
	}

	let confirmDeleteId = $state<string | null>(null);

	async function deleteClient(id: string) {
		const res = await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
		if (res.ok) {
			if (selected?.id === id) selected = null;
			confirmDeleteId = null;
			await load();
			toastSuccess('Client deleted');
		} else {
			confirmDeleteId = null;
			toastError('Failed to delete client');
		}
	}

	async function createProject() {
		if (!newProjectName.trim() || !newProjectClientId) return;
		const res = await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify({ name: newProjectName, client_id: newProjectClientId }) });
		newProjectName = '';
		if (res.ok) { toastSuccess('Project created'); }
		else { toastError('Failed to create project'); }
		await load();
		selected = clients.find(c => c.id === newProjectClientId) ?? null;
	}

	function projectCount(c: Client) {
		return c.projects?.length ?? 0;
	}
</script>

<svelte:head><title>Clients — RogueOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Clients</h2>
	</div>

	<div class="flex flex-col lg:flex-row flex-1 overflow-hidden">
		<!-- Client list -->
		<div class="{selected ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'} w-full lg:w-72 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#1e1e1e]">
			<!-- New client -->
			<div class="p-4 border-b border-[#1e1e1e]">
				<div class="flex gap-2">
					<input bind:value={newClientName} placeholder="New client name" onkeydown={(e) => e.key === 'Enter' && createClient()}
						class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					<button onclick={createClient} disabled={adding || !newClientName.trim()}
						class="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						+
					</button>
				</div>
			</div>
			<div class="flex-1 overflow-y-auto">
				{#each clients as client}
					<button
						onclick={() => { selected = client; loadEngagements(client.id); engagements = []; loadDocs(client.id); docs = []; }}
						class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selected?.id === client.id ? 'bg-white/10' : 'hover:bg-white/5'}"
					>
						<p class="text-sm text-white font-medium truncate">{client.name}</p>
						<p class="text-xs text-[#555] mt-0.5">{projectCount(client)} project{projectCount(client) !== 1 ? 's' : ''}</p>
					</button>
				{:else}
					<p class="text-center text-[#444] text-xs py-8">No clients yet</p>
				{/each}
			</div>
		</div>

		<!-- Client detail -->
		<div class="flex-1 overflow-y-auto p-6 lg:p-8">
			{#if selected}
				<div class="max-w-2xl">
					<div class="flex items-center gap-2 mb-2">
						<button onclick={() => selected = null} class="lg:hidden text-xs text-[#555] hover:text-white transition-colors">← Back</button>
					</div>
					<div class="flex items-center justify-between mb-6">
						<h3 class="text-white text-xl font-semibold">{selected.name}</h3>
						<div class="flex items-center gap-2">
							<button onclick={startEditClient} class="text-xs text-[#555] hover:text-white border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors">
								✎ Edit Profile
							</button>
							<button onclick={() => { showKbChat = !showKbChat; if (showKbChat) kbHistory = []; }} class="rounded-lg border border-[var(--accent)]/40 px-3 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] transition-colors">✨ Ask AI</button>
							<button onclick={getInsights} class="rounded-lg border border-blue-800 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-900/20 transition-colors">
								📊 Insights
							</button>
						</div>
						<div class="flex items-center gap-2">
							{#if confirmDeleteId === selected!.id}
								<span class="text-xs text-red-400">Sure?</span>
								<button onclick={() => deleteClient(selected!.id)} class="text-xs text-red-400 hover:text-red-300">Yes</button>
								<button onclick={() => confirmDeleteId = null} class="text-xs text-[#555] hover:text-white ml-1">No</button>
							{:else}
								<button onclick={() => confirmDeleteId = selected!.id} class="text-xs text-red-700 hover:text-red-400 transition-colors">Delete client</button>
							{/if}
						</div>
				</div>

				<!-- Client Profile -->
				{#if editingClient}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<div class="grid grid-cols-2 gap-3">
							<div><label class="text-xs text-[#555] block mb-1">Website</label>
								<input bind:value={clientEdit.website} placeholder="https://" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">Industry</label>
								<input bind:value={clientEdit.industry} placeholder="e.g. DTC, SaaS, E-commerce" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">Primary Contact</label>
								<input bind:value={clientEdit.primary_contact_name} placeholder="Name" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">Contact Email</label>
								<input bind:value={clientEdit.primary_contact_email} placeholder="email@company.com" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">Contact Phone</label>
								<input bind:value={clientEdit.primary_contact_phone} placeholder="+1 612..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">Contract Value ($/mo)</label>
								<input type="number" bind:value={clientEdit.contract_value} placeholder="2800" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">LinkedIn</label>
								<input bind:value={clientEdit.linkedin_url} placeholder="https://linkedin.com/company/..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
							<div><label class="text-xs text-[#555] block mb-1">Status</label>
								<select bind:value={clientEdit.contract_status} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
									{#each ['prospect','active','paused','ended'] as s}<option value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>{/each}
								</select>
							</div>
						</div>
						<div class="mt-3"><label class="text-xs text-[#555] block mb-1">Notes</label>
							<textarea bind:value={clientEdit.notes} rows="2" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none resize-none"></textarea>
						</div>
						<div class="flex gap-2 mt-3">
							<button onclick={() => editingClient = false} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#777] hover:border-white hover:text-white transition-colors">Cancel</button>
							<button onclick={saveClientEdit} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">Save Profile</button>
						</div>
					</div>
				{:else}
					{#if selected.description || selected.industry || selected.website || selected.primary_contact_name || selected.contract_value}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<div class="flex items-center justify-between mb-3">
								<p class="text-xs text-[#999] uppercase tracking-widest">Client Profile</p>
								<button onclick={startEditClient} class="text-xs text-[#444] hover:text-white transition-colors">Edit ✎</button>
							</div>
							<div class="grid grid-cols-2 gap-2 text-xs">
								{#if selected.industry}<div><span class="text-[#555]">Industry</span><p class="text-white">{selected.industry}</p></div>{/if}
								{#if selected.contract_value}<div><span class="text-[#555]">Contract</span><p class="text-white">${selected.contract_value?.toLocaleString()}/mo</p></div>{/if}
								{#if selected.primary_contact_name}<div><span class="text-[#555]">Contact</span><p class="text-white">{selected.primary_contact_name}</p></div>{/if}
								{#if selected.primary_contact_email}<div><span class="text-[#555]">Email</span><a href="mailto:{selected.primary_contact_email}" class="text-blue-400 hover:underline">{selected.primary_contact_email}</a></div>{/if}
								{#if selected.primary_contact_phone}<div><span class="text-[#555]">Phone</span><a href="/phone?number={selected.primary_contact_phone}" class="text-[var(--accent)] hover:underline">{selected.primary_contact_phone}</a></div>{/if}
								{#if selected.website}<div class="col-span-2"><span class="text-[#555]">Website</span><a href={selected.website} target="_blank" rel="noopener" class="text-blue-400 hover:underline ml-2">{selected.website} ↗</a></div>{/if}
								{#if selected.contract_status && selected.contract_status !== 'active'}<div><span class="text-[#555]">Status</span><span class="text-yellow-400 capitalize ml-1">{selected.contract_status}</span></div>{/if}
							</div>
							{#if selected.notes}<p class="text-xs text-[#666] mt-2 border-t border-[#1a1a1a] pt-2">{selected.notes}</p>{/if}
						</div>
					{:else}
						<div class="rounded-xl border border-[#2a2a2a] border-dashed p-4 mb-4 text-center">
							<button onclick={startEditClient} class="text-xs text-[#444] hover:text-white transition-colors">+ Add client profile details</button>
						</div>
					{/if}
				{/if}

				<!-- Engagement / Compensation -->
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4 mb-4">
					<div class="flex items-center justify-between mb-3">
						<p class="text-xs text-[#999] uppercase tracking-widest">Compensation</p>
						<button onclick={() => showEngForm = !showEngForm} class="text-xs text-[#555] hover:text-white transition-colors">
							{showEngForm ? 'Cancel' : '+ Set rates'}
						</button>
					</div>
					{#if engagements.length > 0}
						{#each engagements as eng}
							<div class="flex items-center justify-between rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2.5 mb-2">
								<div>
									<p class="text-sm text-white">${eng.base_fee.toLocaleString()}<span class="text-[#555] text-xs">/mo base</span></p>
									<p class="text-xs text-yellow-400">${eng.bonus_rate} per appointment · bills day {eng.billing_day}</p>
									{#if eng.notes}<p class="text-[10px] text-[#444] mt-0.5">{eng.notes}</p>{/if}
								</div>
								<button onclick={() => window.confirm('Remove this engagement?') && deleteEngagement(eng.id)} class="text-[#333] hover:text-red-400 text-xs transition-colors"><Icon name="x" size={14} /></button>
							</div>
						{/each}
					{:else if !showEngForm}
						<p class="text-xs text-[#444]">No rates set. Click "+ Set rates" to configure.</p>
					{/if}
					{#if showEngForm}
						<div class="space-y-2 mt-2">
							<div class="grid grid-cols-3 gap-2">
								<div>
									<label class="block text-[10px] text-[#555] mb-1">Base ($/mo)</label>
									<input type="number" bind:value={engBaseFee} placeholder="2000"
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none" />
								</div>
								<div>
									<label class="block text-[10px] text-[#555] mb-1">Bonus ($/appt)</label>
									<input type="number" bind:value={engBonusRate} placeholder="50"
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none" />
								</div>
								<div>
									<label class="block text-[10px] text-[#555] mb-1">Bill day</label>
									<input type="number" bind:value={engBillingDay} placeholder="1" min="1" max="28"
										class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none" />
								</div>
							</div>
							<input bind:value={engNotes} placeholder="Notes (optional)"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
							<button onclick={saveEngagement} disabled={savingEng}
								class="w-full rounded-lg bg-white py-1.5 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">
								{savingEng ? 'Saving…' : 'Save Rates'}
							</button>
						</div>
					{/if}
				</div>

				<!-- Client Docs -->
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4 mb-4">
					<div class="flex items-center justify-between mb-3">
						<p class="text-xs text-[#999] uppercase tracking-widest">Documents</p>
						<button onclick={() => showDocForm = !showDocForm} class="text-xs text-[#555] hover:text-white transition-colors">
							{showDocForm ? 'Cancel' : '+ Add doc'}
						</button>
					</div>
					{#if clientSubmitted.length > 0}
						<div class="mb-3 rounded-lg border border-yellow-900/30 bg-yellow-950/10 p-3 space-y-1.5">
							<p class="text-[10px] text-yellow-400 uppercase tracking-widest">📬 From client</p>
							{#each clientSubmitted as doc}
								<div class="flex items-center gap-2">
									<span class="text-sm">{doc.doc_type === 'asset' ? '🎨' : '📁'}</span>
									<div class="flex-1 min-w-0">
										<a href={doc.url} target="_blank" rel="noopener noreferrer" class="text-xs text-white hover:underline truncate block">{doc.title}</a>
										<p class="text-[9px] text-[#444]">{doc.submitted_by_name ?? 'Client'} · {new Date(doc.created_at).toLocaleDateString()}</p>
									</div>
									<button onclick={() => deleteDoc(doc.id)} class="text-[#333] hover:text-red-400 text-xs shrink-0"><Icon name="x" size={14} /></button>
								</div>
							{/each}
						</div>
					{/if}

					{#if adminDocs.length > 0}
						<div class="space-y-1.5 mb-3">
							{#each adminDocs as doc}
								<div class="flex items-center gap-3 rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2">
									<span class="text-base">{doc.doc_type === 'pdf' ? '📄' : doc.doc_type === 'contract' ? '📑' : doc.doc_type === 'link' ? '🔗' : doc.doc_type === 'sow' ? '📋' : '📁'}</span>
									<div class="flex-1 min-w-0">
										<a href={doc.url} target="_blank" rel="noopener noreferrer" class="text-xs text-white hover:underline truncate block">{doc.title}</a>
								{#if doc.description}<p class="text-[10px] text-[#444] mt-0.5">{doc.description}</p>{/if}
								<p class="text-[10px] text-[#333]">{new Date(doc.created_at).toLocaleDateString()}</p>
							</div>
							<a href={doc.url} target="_blank" rel="noopener noreferrer" class="text-[#555] hover:text-white text-xs shrink-0">↗</a>
						</div>
					{/each}
					</div>
				{/if}

				</div><!-- /docs card -->
			</div><!-- /max-w-2xl selected detail -->

		{:else}
			<!-- Empty state — no client selected -->
			<div class="flex flex-col items-center justify-center h-full text-center px-8 py-16">
				<div class="mb-8">
					<div class="w-16 h-16 rounded-2xl border border-[#1a1a1a] bg-[#080808] flex items-center justify-center mx-auto mb-5">
						<span class="text-2xl">🏢</span>
					</div>
					<h3 style="font-family:var(--font-display);font-weight:300;font-size:22px;color:#fff;margin-bottom:6px">Select a client</h3>
					<p class="text-xs text-[#444]">Click a client on the left to view their campaigns, compensation, docs, and AI insights.</p>
				</div>

				<!-- Aggregate stats across all clients -->
				{#if clients.length > 0}
					<div class="grid grid-cols-3 gap-4 w-full max-w-sm mb-8">
						<div class="rounded-xl border border-[#1a1a1a] bg-[#080808] p-4">
							<p class="text-2xl font-semibold text-white">{clients.length}</p>
							<p class="text-[10px] text-[#444] mt-1 uppercase tracking-wider">Clients</p>
						</div>
						<div class="rounded-xl border border-[#1a1a1a] bg-[#080808] p-4">
							<p class="text-2xl font-semibold text-white">{clients.reduce((s, c) => s + (c.projects?.length ?? 0), 0)}</p>
							<p class="text-[10px] text-[#444] mt-1 uppercase tracking-wider">Projects</p>
						</div>
						<div class="rounded-xl border border-[#1a1a1a] bg-[#080808] p-4">
							<p class="text-2xl font-semibold text-[var(--accent)]">${clients.reduce((s, c) => s + (c.contract_value ?? 0), 0).toLocaleString()}</p>
							<p class="text-[10px] text-[#444] mt-1 uppercase tracking-wider">Monthly</p>
						</div>
					</div>

					<!-- Client grid for quick access -->
					<div class="grid grid-cols-2 gap-2 w-full max-w-sm">
						{#each clients.slice(0,4) as client}
							<button
								onclick={() => { selected = client; loadEngagements(client.id); engagements = []; loadDocs(client.id); docs = []; }}
								class="rounded-xl border border-[#1a1a1a] bg-[#080808] hover:border-[#262626] hover:bg-[#0f0f0f] px-4 py-3 text-left transition-colors cursor-pointer">
								<p class="text-sm text-white font-medium truncate">{client.name}</p>
								<p class="text-[10px] text-[#444] mt-0.5">{client.projects?.length ?? 0} project{(client.projects?.length ?? 0) !== 1 ? 's' : ''}</p>
							</button>
						{/each}
					</div>
				{:else}
					<button
						onclick={() => { const input = document.querySelector('input[placeholder="New client name"]') as HTMLInputElement; input?.focus(); }}
						class="rounded-xl border border-[#2a2a2a] px-6 py-3 text-xs text-[#555] hover:border-white hover:text-white transition-colors">
						+ Add your first client
					</button>
				{/if}
			</div>
		{/if}
		</div><!-- /client detail panel -->
	</div><!-- /flex row -->
</div>
