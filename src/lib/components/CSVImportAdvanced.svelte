<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	let { callListId = '', onImportDone = undefined }: {
		callListId?: string;
		onImportDone?: (created: number) => void;
	} = $props();

	type Step = 'upload' | 'mapping' | 'preview' | 'done';
	let step = $state<Step>('upload');

	// Upload state
	let csvContent = $state('');
	let headers = $state<string[]>([]);
	let sampleRows = $state<string[][]>([]);
	let dragOver = $state(false);

	// Mapping state
	let mappings = $state<Record<string, string>>({}); // csvHeader → crmField or 'create_new'
	let confidence = $state<Record<string, string>>({});
	let suggestedCustomFields = $state<{csvHeader:string;fieldKey:string;fieldName:string;fieldType:string;reason:string}[]>([]);
	let fieldsToCreate = $state<Set<string>>(new Set()); // csvHeaders of AI-suggested custom fields to create
	let crmFields = $state<{key:string;label:string;required?:boolean}[]>([]);
	let existingCustomFields = $state<{key:string;label:string}[]>([]); // loaded on mount
	let aiNotes = $state('');
	let aiMapping = $state(false);
	let mappingError = $state('');

	// User-defined new fields (inline creation during mapping)
	interface NewFieldDef { fieldName: string; fieldKey: string; fieldType: string; }
	let userNewFields = $state<Record<string, NewFieldDef>>({}); // csvHeader → field def being created

	// Preview state
	interface PreviewRow { rowNum:number; status:'new'|'duplicate'|'invalid'; dupReason:string; record:Record<string,string>; rawRow:string[]; approved:boolean; }
	let previewRows = $state<PreviewRow[]>([]);
	let counts = $state({ new:0, duplicate:0, invalid:0 });
	let loadingPreview = $state(false);
	let importError = $state('');

	// Done state
	let importResult = $state<{created:number;errors:number;contact_ids?:string[]}|null>(null);
	let importing = $state(false);

	// Post-import routing
	let routingCampaignId = $state('');
	let routingCampaigns = $state<{id:string;name:string;call_lists:{id:string;name:string}[]}[]>([]);
	let routingListId = $state('');
	let routing = $state(false);
	let routingDone = $state(false);

	async function loadCampaignsForRouting() {
		const r = await apiFetch('/api/campaigns');
		if (r.ok) routingCampaigns = await r.json();
	}

	async function routeContactsToCampaign() {
		if (!routingListId || !importResult?.contact_ids?.length) return;
		routing = true;
		const rows = importResult.contact_ids.map((id, i) => ({
			call_list_id: routingListId,
			contact_id: id,
			status: 'pending',
			queue_position: i,
		}));
		// Batch in chunks of 500
		for (let i = 0; i < rows.length; i += 500) {
			await apiFetch('/api/call-lists/' + routingListId + '/contacts', {
				method: 'POST',
				body: JSON.stringify({ contacts: rows.slice(i, i + 500) }),
			}).catch(() => {});
		}
		routing = false;
		routingDone = true;
	}

	// Bulk assignment state
	let bulkTags = $state<string[]>([]);
	let bulkTagInput = $state('');
	let bulkClientId = $state('');
	let bulkCampaignId = $state('');
	let bulkContactType = $state('');
	let clients = $state<{id:string;name:string}[]>([]);
	let campaigns = $state<{id:string;name:string}[]>([]);

	onMount(async () => {
		const [clientRes, campRes, cfRes] = await Promise.all([
			apiFetch('/api/clients'),
			apiFetch('/api/campaigns'),
			apiFetch('/api/custom-fields'),
		]);
		clients = clientRes.ok ? (await clientRes.json()).map((c: {id:string;name:string}) => ({ id: c.id, name: c.name })) : [];
		campaigns = campRes.ok ? await campRes.json() : [];
		if (cfRes.ok) {
			const cf = await cfRes.json();
			existingCustomFields = (cf as {field_key:string;name:string;field_type:string}[])
				.map(f => ({ key: `custom:${f.field_key}`, label: `${f.name} (${f.field_type})` }));
		}
	});

	function addBulkTag() {
		const t = bulkTagInput.trim().toLowerCase().replace(/\s+/g, '-');
		if (t && !bulkTags.includes(t)) bulkTags = [...bulkTags, t];
		bulkTagInput = '';
	}

	function removeBulkTag(tag: string) {
		bulkTags = bulkTags.filter(t => t !== tag);
	}

	function parseCSVText(text: string): string[][] {
		return text.trim().split('\n').map(row => {
			const result: string[] = [];
			let inQuote = false;
			let current = '';
			for (const ch of row) {
				if (ch === '"') inQuote = !inQuote;
				else if (ch === ',' && !inQuote) { result.push(current.trim()); current = ''; }
				else current += ch;
			}
			result.push(current.trim());
			return result;
		});
	}

	function loadFile(file: File) {
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			csvContent = text;
			const rows = parseCSVText(text);
			headers = rows[0] ?? [];
			sampleRows = rows.slice(1, 4);
			// Default mappings (auto-detect common names)
			const autoMap: Record<string,string> = {};
			for (const h of headers) {
				const lower = h.toLowerCase().trim();
				if (['name','full name','contact name','full_name'].includes(lower)) autoMap[h] = 'name';
				else if (['first name','first_name','firstname'].includes(lower)) autoMap[h] = 'first_name';
				else if (['last name','last_name','lastname','surname'].includes(lower)) autoMap[h] = 'last_name';
				else if (['phone','phone number','mobile','cell','telephone','phone_number','mobile_number'].includes(lower)) autoMap[h] = 'phone';
				else if (['email','email address','e-mail','email_address'].includes(lower)) autoMap[h] = 'email';
				else if (['company','organization','organisation','employer','account','company_name'].includes(lower)) autoMap[h] = 'company';
				else if (['title','job title','position','role','job_title'].includes(lower)) autoMap[h] = 'title';
				else if (['notes','note','comments','description'].includes(lower)) autoMap[h] = 'notes';
				else autoMap[h] = 'skip';
			}
			mappings = autoMap;
			step = 'mapping';
		};
		reader.readAsText(file);
	}

	async function runAIMapping() {
		aiMapping = true; mappingError = '';
		try {
			const res = await apiFetch('/api/contacts/ai-map', { method:'POST', body: JSON.stringify({ headers, sampleRows }) });
			if (res.ok) {
				const data = await res.json();
				mappings = { ...mappings, ...data.mappings };
				confidence = data.confidence ?? {};
				suggestedCustomFields = data.suggestedCustomFields ?? [];
				aiNotes = data.notes ?? '';
				crmFields = data.crmFields ?? [];
			} else mappingError = 'AI mapping unavailable — set fields manually';
		} catch { mappingError = 'AI mapping failed'; }
		aiMapping = false;
	}

	// Resolve 'create_new' mappings → the custom field key so preview/import use the right key
	function resolvedMappings(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [h, v] of Object.entries(mappings)) {
			if (v === 'create_new' && userNewFields[h]?.fieldKey?.trim()) {
				out[h] = `custom:${userNewFields[h].fieldKey}`;
			} else {
				out[h] = v;
			}
		}
		return out;
	}

	async function runPreview() {
		loadingPreview = true;
		try {
			const res = await apiFetch('/api/contacts/preview', { method:'POST', body: JSON.stringify({ csv: csvContent, fieldMapping: resolvedMappings() }) });
			if (res.ok) {
				const d = await res.json();
				previewRows = d.rows;
				counts = d.counts;
				step = 'preview';
			}
		} catch { importError = 'Preview failed'; }
		loadingPreview = false;
	}

	async function runImport() {
		const approved = previewRows.filter(r => r.approved && r.status !== 'invalid');
		if (!approved.length) { importError = 'No rows selected for import'; return; }
		importing = true; importError = '';
		// Merge AI-suggested fields (checked) + user-defined inline fields
		const customFieldsToCreate = [
			...suggestedCustomFields.filter(f => fieldsToCreate.has(f.csvHeader)),
			...Object.entries(userNewFields)
				.filter(([, def]) => def.fieldName.trim() && def.fieldKey.trim())
				.map(([csvHeader, def]) => ({ csvHeader, fieldKey: def.fieldKey, fieldName: def.fieldName, fieldType: def.fieldType })),
		];
		const res = await apiFetch('/api/contacts/import-mapped', {
			method: 'POST',
			body: JSON.stringify({
				rows: approved,
				fieldMapping: resolvedMappings(),
				callListId: callListId || null,
				createCustomFields: customFieldsToCreate,
				bulkTags: bulkTags.length ? bulkTags : undefined,
				bulkClientId: bulkClientId || undefined,
				bulkCampaignId: bulkCampaignId || undefined,
				bulkContactType: bulkContactType || undefined,
			}),
		});
		if (res.ok) {
			importResult = await res.json();
			step = 'done';
			onImportDone?.(importResult!.created);
			loadCampaignsForRouting(); // preload campaigns for routing prompt
		} else importError = 'Import failed';
		importing = false;
	}

	function toggleAll(status: 'new'|'duplicate', approved: boolean) {
		previewRows = previewRows.map(r => r.status === status ? { ...r, approved } : r);
	}

	const approvedCount = $derived(previewRows.filter(r => r.approved).length);

	const CONFIDENCE_COLORS: Record<string,string> = { high:'text-[var(--accent)]', medium:'text-yellow-400', low:'text-orange-400' };
	const STATUS_COLORS: Record<string,string> = { new:'border-[var(--accent)]/40 bg-[var(--accent)]/12', duplicate:'border-yellow-800 bg-yellow-950/10', invalid:'border-red-900 bg-red-950/10 opacity-60' };
	const STATUS_BADGES: Record<string,string> = { new:'text-[var(--accent)]', duplicate:'text-yellow-400', invalid:'text-red-400' };
</script>

<div class="space-y-4">
	<!-- Step indicator -->
	<div class="flex items-center gap-2 text-xs">
		{#each [['upload','1. Upload'],['mapping','2. Map Fields'],['preview','3. Review'],['done','4. Done']] as [s, label]}
			<span class="{step === s ? 'text-white font-medium' : step === 'done' || ['mapping','preview','done'].indexOf(step) > ['mapping','preview','done'].indexOf(s as Step) ? 'text-[#666]' : 'text-[#333]'}">{label}</span>
			{#if s !== 'done'}<span class="text-[#333]">›</span>{/if}
		{/each}
	</div>

	<!-- STEP 1: Upload -->
	{#if step === 'upload'}
		<div
			role="button" tabindex="0"
			class="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors {dragOver ? 'border-white bg-white/5' : 'border-[#2a2a2a] hover:border-[#444]'}"
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => dragOver = false}
			ondrop={(e) => { e.preventDefault(); dragOver = false; const f = e.dataTransfer?.files[0]; if (f?.name.endsWith('.csv')) loadFile(f); }}
			onclick={() => document.getElementById('csv-adv')?.click()}
			onkeydown={(e) => e.key === 'Enter' && document.getElementById('csv-adv')?.click()}>
			<p class="text-[#666] text-sm mb-1">Drop CSV file or click to browse</p>
			<p class="text-[#444] text-xs">Any column names — AI will map them to the right fields</p>
			<input id="csv-adv" type="file" accept=".csv" class="hidden" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) loadFile(f); }} />
		</div>

	<!-- STEP 2: Field Mapping -->
	{:else if step === 'mapping'}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-sm text-white font-medium">{headers.length} columns detected</p>
				<button onclick={runAIMapping} disabled={aiMapping} class="rounded-lg border border-[var(--accent)]/40 px-3 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] disabled:opacity-40 transition-colors">
					{aiMapping ? '✨ Mapping...' : '✨ AI Auto-Map'}
				</button>
			</div>
			{#if mappingError}<p class="text-xs text-yellow-400">{mappingError}</p>{/if}
			{#if aiNotes}<p class="text-xs text-[#555] italic">AI: {aiNotes}</p>{/if}

			<!-- Column mapping table -->
			<div class="rounded-xl border border-[#2a2a2a] overflow-hidden">
				<div class="grid grid-cols-3 gap-0 bg-[#1a1a1a] px-4 py-2 text-xs text-[#555] uppercase tracking-widest">
					<span>CSV Column</span><span>Sample Data</span><span>Maps To</span>
				</div>
				{#each headers as h, i}
					<div class="border-t border-[#1e1e1e] hover:bg-white/3">
						<div class="grid grid-cols-3 gap-0 px-4 py-2.5 items-center">
							<div class="flex items-center gap-2">
								<p class="text-sm text-white">{h}</p>
								{#if confidence[h]}
									<span class="text-xs {CONFIDENCE_COLORS[confidence[h]] ?? 'text-[#444]'}">{confidence[h]}</span>
								{/if}
							</div>
							<p class="text-xs text-[#555] truncate pr-3">{sampleRows[0]?.[i] ?? ''}</p>
							<select
								value={mappings[h] ?? 'skip'}
								onchange={(e) => {
									const val = (e.target as HTMLSelectElement).value;
									mappings = { ...mappings, [h]: val };
									if (val === 'create_new' && !userNewFields[h]) {
										const autoKey = h.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
										userNewFields = { ...userNewFields, [h]: { fieldName: h, fieldKey: autoKey, fieldType: 'text' } };
									}
								}}
								class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none w-full">
								<option value="skip">— Skip —</option>
								<option value="create_new">➕ Create new field…</option>
								<optgroup label="Core Fields">
									{#each (crmFields.length ? crmFields : [
										{key:'name',label:'Full Name'},
										{key:'first_name',label:'First Name'},
										{key:'last_name',label:'Last Name'},
										{key:'phone',label:'Phone'},
										{key:'email',label:'Email'},
										{key:'company',label:'Company/Organization'},
										{key:'title',label:'Job Title'},
										{key:'website',label:'Website URL'},
										{key:'linkedin_url',label:'LinkedIn URL'},
										{key:'notes',label:'Notes'},
										{key:'contact_type',label:'Contact Type'},
										{key:'lead_source',label:'Lead Source'},
										{key:'is_business',label:'Is Business (yes/no)'},
									]) as f}
										<option value={f.key}>{f.label}</option>
									{/each}
								</optgroup>
								{#if existingCustomFields.length > 0}
									<optgroup label="Your Custom Fields">
										{#each existingCustomFields as f}
											<option value={f.key}>{f.label}</option>
										{/each}
									</optgroup>
								{/if}
							</select>
						</div>
						<!-- Inline new-field form -->
						{#if mappings[h] === 'create_new' && userNewFields[h]}
							<div class="mx-4 mb-3 rounded-lg border border-cyan-800/40 bg-cyan-950/10 p-3 space-y-2">
								<p class="text-xs text-cyan-400 font-medium">New custom field</p>
								<div class="grid grid-cols-2 gap-2">
									<div>
										<label class="text-xs text-[#555] block mb-1">Field Name</label>
										<input
											value={userNewFields[h].fieldName}
											oninput={(e) => {
												const name = (e.target as HTMLInputElement).value;
												const key = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
												userNewFields = { ...userNewFields, [h]: { ...userNewFields[h], fieldName: name, fieldKey: key } };
											}}
											placeholder="e.g. Platform"
											class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-cyan-600 focus:outline-none" />
									</div>
									<div>
										<label class="text-xs text-[#555] block mb-1">Field Type</label>
										<select
											value={userNewFields[h].fieldType}
											onchange={(e) => userNewFields = { ...userNewFields, [h]: { ...userNewFields[h], fieldType: (e.target as HTMLSelectElement).value } }}
											class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-2 py-1.5 text-xs text-white focus:border-cyan-600 focus:outline-none">
											<option value="text">Text</option>
											<option value="number">Number</option>
											<option value="select">Select</option>
											<option value="date">Date</option>
											<option value="boolean">Yes/No</option>
											<option value="url">URL</option>
										</select>
									</div>
								</div>
								<p class="text-xs text-[#444]">Key: <span class="font-mono text-[#666]">{userNewFields[h].fieldKey || '—'}</span></p>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Suggested custom fields -->
			{#if suggestedCustomFields.length > 0}
				<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-4 space-y-3">
					<p class="text-xs text-[var(--accent)] font-medium">✨ AI suggests creating custom fields for:</p>
					{#each suggestedCustomFields as cf}
						<label class="flex items-start gap-3 cursor-pointer">
							<input type="checkbox"
								checked={fieldsToCreate.has(cf.csvHeader)}
								onchange={() => { const s = new Set(fieldsToCreate); s.has(cf.csvHeader) ? s.delete(cf.csvHeader) : s.add(cf.csvHeader); fieldsToCreate = s; }}
								class="mt-0.5 rounded" />
							<div class="flex-1">
								<p class="text-sm text-white">{cf.fieldName} <span class="text-xs text-[#444] font-mono">({cf.fieldType})</span></p>
								<p class="text-xs text-[#555]">From column: "{cf.csvHeader}" — {cf.reason}</p>
							</div>
						</label>
					{/each}
				</div>
			{/if}

			<div class="flex gap-3">
				<button onclick={runPreview} disabled={loadingPreview} class="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">
					{loadingPreview ? 'Checking...' : 'Preview Import →'}
				</button>
				<button onclick={() => step = 'upload'} class="text-xs text-[#555] hover:text-white px-3">← Back</button>
			</div>
		</div>

	<!-- STEP 3: Preview & Approve -->
	{:else if step === 'preview'}
		<div class="space-y-3">
			<!-- Summary -->
			<div class="flex gap-4">
				<div class="rounded-lg bg-[var(--accent)]/12 border border-[var(--accent)]/40 px-4 py-2 flex-1 text-center">
					<p class="text-lg font-semibold text-[var(--accent)]">{counts.new}</p>
					<p class="text-xs text-[#555]">New contacts</p>
				</div>
				<div class="rounded-lg bg-yellow-950/20 border border-yellow-800/30 px-4 py-2 flex-1 text-center">
					<p class="text-lg font-semibold text-yellow-400">{counts.duplicate}</p>
					<p class="text-xs text-[#555]">Duplicates</p>
				</div>
				<div class="rounded-lg bg-red-950/20 border border-red-800/30 px-4 py-2 flex-1 text-center">
					<p class="text-lg font-semibold text-red-400">{counts.invalid}</p>
					<p class="text-xs text-[#555]">Invalid rows</p>
				</div>
			</div>

			<!-- Bulk actions -->
			<div class="flex gap-2 flex-wrap text-xs">
				<button onclick={() => toggleAll('new', true)} class="rounded border border-[#2a2a2a] px-2 py-1 text-[#666] hover:text-white">✓ All new</button>
				<button onclick={() => toggleAll('new', false)} class="rounded border border-[#2a2a2a] px-2 py-1 text-[#666] hover:text-white">✗ Deselect new</button>
				<button onclick={() => toggleAll('duplicate', true)} class="rounded border border-[#2a2a2a] px-2 py-1 text-yellow-600 hover:text-yellow-400">✓ Include dupes</button>
				<button onclick={() => toggleAll('duplicate', false)} class="rounded border border-[#2a2a2a] px-2 py-1 text-yellow-600 hover:text-yellow-400">✗ Skip dupes</button>
				<p class="ml-auto text-[#555]">{approvedCount} selected</p>
			</div>

			<!-- Row table -->
			<div class="max-h-56 overflow-y-auto rounded-xl border border-[#2a2a2a]">
				{#each previewRows as row}
					<div class="flex items-center gap-3 px-4 py-2.5 border-b border-[#1a1a1a] last:border-0 {STATUS_COLORS[row.status]}">
						<input type="checkbox" bind:checked={row.approved} disabled={row.status === 'invalid'} class="rounded shrink-0" />
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<p class="text-xs text-white font-medium truncate">{row.record.name || '(no name)'}</p>
								<span class="text-xs {STATUS_BADGES[row.status]} capitalize shrink-0">{row.status}</span>
							</div>
							<p class="text-xs text-[#555] truncate">{[row.record.company, row.record.phone, row.record.email].filter(Boolean).join(' · ')}</p>
						</div>
						{#if row.status === 'duplicate'}<span class="text-[9px] text-yellow-600 shrink-0">{row.dupReason}</span>{/if}
					</div>
				{/each}
			</div>

			{#if importError}<p class="text-xs text-red-400">{importError}</p>{/if}

			<button onclick={runImport} disabled={importing || approvedCount === 0}
				class="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
				{importing ? `Importing ${approvedCount} contacts…` : `Import ${approvedCount} contact${approvedCount !== 1 ? 's' : ''}`}
			</button>
		</div>

	<!-- STEP 4: Done + routing prompt -->
	{:else if step === 'done'}
		<div class="space-y-5">
			<!-- Result summary -->
			<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-5 text-center">
				<p class="text-2xl font-semibold text-[var(--accent)] mb-1">{importResult?.created ?? 0}</p>
				<p class="text-xs text-[#555]">contacts imported{importResult?.errors ? ` · ${importResult.errors} errors` : ''}</p>
			</div>

			<!-- Routing prompt -->
			{#if !routingDone && importResult && importResult.created > 0}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5">
					<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:var(--c-text-faint);margin-bottom:10px">Route to campaign</p>
					<p class="text-xs text-[#555] mb-4">Add these {importResult.created} contacts to a call list so your reps can start dialing them immediately.</p>

					<div class="space-y-3">
						<select bind:value={routingCampaignId}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
							<option value="">Select a campaign…</option>
							{#each routingCampaigns as camp}
								<option value={camp.id}>{camp.name}</option>
							{/each}
						</select>

						{#if routingCampaignId}
							{@const selectedCamp = routingCampaigns.find(c => c.id === routingCampaignId)}
							{#if selectedCamp?.call_lists?.length}
								<select bind:value={routingListId}
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
									<option value="">Select a call list…</option>
									{#each selectedCamp.call_lists as list}
										<option value={list.id}>{list.name}</option>
									{/each}
								</select>
							{/if}
						{/if}

						<div class="flex gap-2">
							<button onclick={routeContactsToCampaign} disabled={routing || !routingListId}
								class="flex-1 rounded-xl bg-white py-2.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
								{routing ? 'Adding to queue…' : '→ Add to call queue'}
							</button>
							<button onclick={() => routingDone = true}
								class="rounded-xl border border-[#2a2a2a] px-4 py-2.5 text-xs text-[#555] hover:text-white hover:border-white transition-colors">
								Skip
							</button>
						</div>
					</div>
				</div>
			{:else if routingDone}
				<div class="rounded-xl border border-[#1a1a1a] bg-[#080808] p-4 text-center">
					<p class="text-xs text-[var(--accent)]">✓ Contacts added to call queue</p>
					<a href="/dialer" class="text-[10px] text-[#444] hover:text-white mt-1 block transition-colors">Open dialer →</a>
				</div>
			{/if}

			<button onclick={() => { step = 'upload'; importResult = null; routingDone = false; routingCampaignId = ''; routingListId = ''; }}
				class="w-full rounded-xl border border-[#2a2a2a] py-2.5 text-xs text-[#555] hover:border-white hover:text-white transition-colors">
				Import another file
			</button>
		</div>
	{/if}

</div>
