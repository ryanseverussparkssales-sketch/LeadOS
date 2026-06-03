<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { CRM_TEMPLATES } from '$lib/crmTemplates';
	import CSVImportAdvanced from '$lib/components/CSVImportAdvanced.svelte';

	type Mode = 'new' | 'sync' | 'undo' | 'reverse' | 'crm';
	let mode = $state<Mode>('new');

	// Sync import state
	let syncFile = $state('');
	let syncHeaders = $state<string[]>([]);
	let syncFieldMap = $state<Record<string,string>>({});
	let syncUpdateFields = $state(['company','title','email','notes','lead_source']);
	let syncing = $state(false);
	let syncResult = $state<{created:number;updated:number;skipped:number;errors:number}|null>(null);

	// Undo import state
	let batches = $state<{id:string;filename:string;source:string;mode:string;total_created:number;total_updated:number;can_undo:boolean;created_at:string}[]>([]);
	let selectedBatch = $state('');
	let batchContacts = $state<{id:string;name:string;phone:string;company:string;call_count:number}[]>([]);
	let undoing = $state(false);
	let undoResult = $state<{deleted:number;message:string}|null>(null);

	// Reverse lookup state
	type LookupType = 'phone'|'email'|'company'|'domain';
	let lookupType = $state<LookupType>('phone');
	let lookupInput = $state('');
	let lookupResults = $state<{input:string;found:boolean;contact?:Record<string,unknown>;enrichment?:Record<string,unknown>}[]>([]);
	let lookupSummary = $state<{total:number;found:number;notFound:number}|null>(null);
	let lookingUp = $state(false);
	let enrichWithAI = $state(false);

	// CRM migration state
	let selectedCRM = $state('');
	let crmFile = $state('');

	onMount(async () => {
		const res = await apiFetch('/api/contacts/import-batches');
		batches = res.ok ? await res.json() : [];
	});

	async function loadBatchContacts(id: string) {
		selectedBatch = id;
		const res = await apiFetch(`/api/contacts/import-batches/${id}`);
		batchContacts = res.ok ? await res.json() : [];
	}

	async function undoBatch() {
		if (!selectedBatch) return;
		undoing = true; undoResult = null;
		const res = await apiFetch(`/api/contacts/import-batches/${selectedBatch}`, { method:'DELETE' });
		if (res.ok) {
			undoResult = await res.json();
			batches = batches.map(b => b.id === selectedBatch ? { ...b, can_undo: false } : b);
		}
		undoing = false;
	}

	function loadCsvForSync(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = ev.target?.result as string;
			syncFile = text;
			const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
			syncHeaders = rows[0] ?? [];
			// Auto-map
			const autoMap: Record<string,string> = {};
			for (const h of syncHeaders) {
				const l = h.toLowerCase();
				if (['name','full name'].includes(l)) autoMap[h] = 'name';
				else if (['phone','mobile'].includes(l)) autoMap[h] = 'phone';
				else if (['email'].includes(l)) autoMap[h] = 'email';
				else if (['company','organization'].includes(l)) autoMap[h] = 'company';
				else if (['title','job title'].includes(l)) autoMap[h] = 'title';
				else if (['notes'].includes(l)) autoMap[h] = 'notes';
				else autoMap[h] = 'skip';
			}
			syncFieldMap = autoMap;
		};
		reader.readAsText(file);
	}

	async function runLookup() {
		const items = lookupInput.trim().split('\n').map(l => l.trim()).filter(Boolean);
		if (!items.length) return;
		lookingUp = true; lookupResults = []; lookupSummary = null;
		const res = await apiFetch('/api/contacts/reverse-lookup', { method:'POST', body: JSON.stringify({ lookupType, items, enrichWithAI }) });
		if (res.ok) { const d = await res.json(); lookupResults = d.results; lookupSummary = d.summary; }
		lookingUp = false;
	}

	function applyCRMTemplate(crmKey: string) {
		selectedCRM = crmKey;
	}

	function fmtDate(iso: string) { return new Date(iso).toLocaleString(); }
</script>

<svelte:head><title>Import Center — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Import Center</h2>
		<div class="flex gap-1 mt-3">
			{#each ([['new','📥 New Import'],['sync','🔄 Sync Update'],['undo','↩ Undo Import'],['reverse','🔍 Reverse Lookup'],['crm','🏢 CRM Migration']] as [Mode,string][]) as [m, label]}
				<button onclick={() => mode = m} class="rounded-lg px-4 py-1.5 text-xs transition-colors {mode === m ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">{label}</button>
			{/each}
		</div>
	</div>

	<div class="flex-1 overflow-y-auto p-8">

		<!-- NEW IMPORT -->
		{#if mode === 'new'}
			<div class="max-w-2xl">
				<p class="text-xs text-[#555] mb-4">Standard CSV import with AI field mapping and dedup detection.</p>
				<CSVImportAdvanced onImportDone={(n) => { /* refresh */ }} />
			</div>

		<!-- SYNC UPDATE -->
		{:else if mode === 'sync'}
			<div class="max-w-2xl space-y-4">
				<div class="rounded-xl border border-blue-800/30 bg-blue-950/10 p-4">
					<p class="text-sm text-blue-300 font-medium">🔄 Sync Import (Update Mode)</p>
					<p class="text-xs text-[#555] mt-1">Import a CSV and UPDATE existing contacts instead of skipping them. Perfect for: exporting → editing in Excel → re-importing changes.</p>
				</div>

				<div>
					<label class="text-xs text-[#555] block mb-1.5">Upload CSV to sync</label>
					<input type="file" accept=".csv" onchange={loadCsvForSync} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white file:mr-3 file:rounded file:border-0 file:bg-white/10 file:text-white file:text-xs file:px-2 file:py-1" />
				</div>

				{#if syncHeaders.length > 0}
					<div>
						<p class="text-xs text-[#999] uppercase tracking-widest mb-2">Fields to update on existing contacts</p>
						<div class="grid grid-cols-3 gap-2">
							{#each ['company','title','email','phone','notes','lead_source','contact_type','website','linkedin_url'] as field}
								<label class="flex items-center gap-2 cursor-pointer rounded-lg border border-[#2a2a2a] px-3 py-2 hover:border-[#444] transition-colors">
									<input type="checkbox" checked={syncUpdateFields.includes(field)} onchange={() => { syncUpdateFields = syncUpdateFields.includes(field) ? syncUpdateFields.filter(f=>f!==field) : [...syncUpdateFields, field]; }} class="rounded" />
									<span class="text-xs text-white capitalize">{field.replace(/_/g,' ')}</span>
								</label>
							{/each}
						</div>
					</div>

					<p class="text-xs text-[#444]">Contacts matched by phone or email will have the checked fields updated. New contacts will be created.</p>

					<button onclick={() => {}} disabled={syncing || !syncFile} class="rounded-lg bg-blue-600 px-6 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
						{syncing ? 'Syncing...' : 'Run Sync Import'}
					</button>
				{/if}

				{#if syncResult}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-1 text-sm hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<p class="text-green-400">✓ {syncResult.created} new contacts created</p>
						<p class="text-blue-400">↑ {syncResult.updated} existing contacts updated</p>
						{#if syncResult.skipped > 0}<p class="text-[#555]">{syncResult.skipped} rows skipped</p>{/if}
						{#if syncResult.errors > 0}<p class="text-red-400">{syncResult.errors} errors</p>{/if}
					</div>
				{/if}
			</div>

		<!-- UNDO IMPORT -->
		{:else if mode === 'undo'}
			<div class="max-w-2xl space-y-4">
				<div class="rounded-xl border border-yellow-800/30 bg-yellow-950/10 p-4">
					<p class="text-sm text-yellow-300 font-medium">↩ Undo Import</p>
					<p class="text-xs text-[#555] mt-1">Delete contacts from a specific import batch. Only contacts that haven't been called are removed.</p>
				</div>

				{#if batches.length === 0}
					<p class="text-[#444] text-sm">No import batches found. Future imports will be tracked here.</p>
				{:else}
					<div class="space-y-2">
						{#each batches as batch}
							<div class="rounded-xl border {selectedBatch === batch.id ? 'border-white/30 bg-white/5' : 'border-[#2a2a2a] bg-[#111111]'} p-4 cursor-pointer hover:border-[#444] transition-colors" onclick={() => loadBatchContacts(batch.id)}>
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm text-white font-medium">{batch.filename ?? 'CSV Import'}</p>
										<p class="text-xs text-[#555]">{fmtDate(batch.created_at)} · {batch.total_created} created{batch.total_updated > 0 ? ` · ${batch.total_updated} updated` : ''} · {batch.source.toUpperCase()}</p>
									</div>
									{#if batch.can_undo}
										<span class="text-xs text-green-400 bg-green-950/30 px-2 py-0.5 rounded">Can undo</span>
									{:else}
										<span class="text-xs text-[#444]">Locked</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					{#if selectedBatch && batchContacts.length > 0}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-xs text-[#999] uppercase tracking-widest">Contacts in this batch ({batchContacts.length})</p>
							<div class="max-h-48 overflow-y-auto space-y-1">
								{#each batchContacts as c}
									<div class="flex items-center gap-3 text-xs">
										<p class="text-white flex-1 truncate">{c.name}</p>
										<p class="text-[#555]">{c.company}</p>
										<span class="{c.call_count > 0 ? 'text-yellow-400' : 'text-green-400'}">{c.call_count > 0 ? `${c.call_count} calls` : 'No calls'}</span>
									</div>
								{/each}
							</div>
							{#if batches.find(b=>b.id===selectedBatch)?.can_undo}
								<button onclick={undoBatch} disabled={undoing} class="rounded-lg border border-red-900 bg-red-950/20 px-4 py-2 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-40">
									{undoing ? 'Undoing...' : `Delete ${batchContacts.filter(c=>c.call_count===0).length} uncontacted contacts`}
								</button>
							{/if}
						</div>
					{/if}

					{#if undoResult}
						<div class="rounded-xl border border-green-800/30 bg-green-950/10 p-4">
							<p class="text-sm text-green-400">✓ {undoResult.message}</p>
						</div>
					{/if}
				{/if}
			</div>

		<!-- REVERSE LOOKUP -->
		{:else if mode === 'reverse'}
			<div class="max-w-2xl space-y-4">
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<p class="text-sm text-white font-medium">🔍 Reverse Lookup</p>
					<p class="text-xs text-[#555] mt-1">Paste a list and find which are already in your CRM — or enrich company domains with AI.</p>
				</div>

				<div class="flex gap-2">
					{#each ([['phone','📞 Phone Numbers'],['email','✉ Emails'],['company','🏢 Company Names'],['domain','🌐 Domains (+ AI)']] as [LookupType,string][]) as [t,l]}
						<button onclick={() => { lookupType = t; if (t==='domain') enrichWithAI=true; }} class="flex-1 rounded-lg border px-3 py-2 text-xs transition-colors {lookupType===t ? 'border-white text-white' : 'border-[#2a2a2a] text-[#555] hover:text-white'}">{l}</button>
					{/each}
				</div>

				{#if lookupType === 'domain'}
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" bind:checked={enrichWithAI} />
						<span class="text-xs text-white">✨ Enrich with AI (company info + ideal contact title)</span>
					</label>
				{/if}

				<textarea bind:value={lookupInput} rows="8" placeholder="One per line:&#10;+16125551234&#10;john@acme.com&#10;Acme Corporation&#10;acme.com" class="w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none" style="font-family:var(--font-mono)"></textarea>

				<button onclick={runLookup} disabled={lookingUp || !lookupInput.trim()} class="rounded-lg bg-white px-6 py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">
					{lookingUp ? (enrichWithAI ? '✨ Looking up + enriching...' : 'Looking up...') : 'Run Lookup'}
				</button>

				{#if lookupSummary}
					<div class="grid grid-cols-3 gap-3">
						<div class="rounded-lg border border-[#2a2a2a] bg-[#111] p-3 text-center"><p class="text-white text-lg font-semibold">{lookupSummary.total}</p><p class="text-xs text-[#555]">Total</p></div>
						<div class="rounded-lg border border-green-800/30 bg-green-950/10 p-3 text-center"><p class="text-green-400 text-lg font-semibold">{lookupSummary.found}</p><p class="text-xs text-[#555]">Found in CRM</p></div>
						<div class="rounded-lg border border-yellow-800/30 bg-yellow-950/10 p-3 text-center"><p class="text-yellow-400 text-lg font-semibold">{lookupSummary.notFound}</p><p class="text-xs text-[#555]">Not in CRM</p></div>
					</div>

					<div class="space-y-2 max-h-72 overflow-y-auto">
						{#each lookupResults as result}
							<div class="flex items-start gap-3 rounded-lg border {result.found ? 'border-green-800/30 bg-green-950/5' : 'border-[#2a2a2a] bg-[#111]'} px-4 py-3">
								<span class="text-base shrink-0">{result.found ? '✅' : '❌'}</span>
								<div class="flex-1 min-w-0">
									<p class="text-xs font-mono text-white">{result.input}</p>
									{#if result.found && result.contact}
										<p class="text-xs text-[#666] mt-0.5">{(result.contact as {name:string}).name} · {(result.contact as {company:string}).company}</p>
									{:else if result.enrichment}
										<p class="text-xs text-purple-400 mt-0.5">✨ {(result.enrichment as {companyName:string}).companyName} — {(result.enrichment as {industry:string}).industry}</p>
										<p class="text-xs text-[#444]">Target: {(result.enrichment as {likelyDecisionMaker:string}).likelyDecisionMaker}</p>
									{:else if !result.found}
										<p class="text-xs text-[#444] mt-0.5">Not found — could be a new lead</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

		<!-- CRM MIGRATION -->
		{:else if mode === 'crm'}
			<div class="max-w-2xl space-y-4">
				<p class="text-xs text-[#555]">Pre-configured field mappings for popular CRM exports. Select your source, then import normally.</p>

				<div class="grid grid-cols-2 gap-3">
					{#each Object.entries(CRM_TEMPLATES) as [key, tmpl]}
						<button onclick={() => applyCRMTemplate(key)}
							class="rounded-xl border p-4 text-left transition-colors {selectedCRM === key ? 'border-white bg-white/5' : 'border-[#2a2a2a] hover:border-[#444]'}">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-lg">{tmpl.icon}</span>
								<p class="text-sm text-white font-medium">{tmpl.name}</p>
							</div>
							<p class="text-xs text-[#444]">{tmpl.notes}</p>
						</button>
					{/each}
				</div>

				{#if selectedCRM}
					{@const tmpl = CRM_TEMPLATES[selectedCRM]}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<p class="text-sm text-white font-medium">{tmpl.icon} {tmpl.name} — Pre-configured Mapping</p>
						<div class="space-y-1.5 max-h-48 overflow-y-auto">
							{#each Object.entries(tmpl.fieldMap) as [csv, crm]}
								<div class="flex items-center gap-3 text-xs">
									<p class="text-[#888] w-40 shrink-0 truncate">{csv}</p>
									<span class="text-[#333]">→</span>
									<p class="text-white capitalize">{crm.replace(/_/g,' ')}</p>
								</div>
							{/each}
						</div>
						<div class="pt-2 border-t border-[#1e1e1e]">
							<p class="text-xs text-[#555] mb-3">{tmpl.notes}</p>
							<p class="text-xs text-white font-medium mb-2">After exporting from {tmpl.name}, use the New Import tab — the AI will recognize these columns automatically.</p>
							<button onclick={() => mode = 'new'} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">Go to Import →</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
