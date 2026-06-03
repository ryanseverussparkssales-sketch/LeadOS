<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	type Tab = 'web' | 'screenshot' | 'enrich' | 'search' | 'streamer' | 'csv';
	let tab = $state<Tab>('web');
	let loading = $state(true);

	// Web scraper
	let scrapeUrl = $state('');
	let scraping = $state(false);
	let scraped = $state<ScrapedContact[]>([]);
	let scrapeError = $state('');

	// Screenshot
	let imgFile = $state<File | null>(null);
	let imgPreview = $state('');
	let extracting = $state(false);
	let extracted = $state<Partial<ScrapedContact> | null>(null);

	// Enrichment
	let contacts = $state<Contact[]>([]);
	let selectedContact = $state('');
	let enriching = $state(false);
	let enrichment = $state<Enrichment | null>(null);

	// All scraped history
	let history = $state<ScrapedContact[]>([]);
	let loadingHistory = $state(true);

	// Call lists (shared across new tabs)
	let callLists = $state<CallList[]>([]);

	// Search
	let searchQuery = $state('');
	let searchCallList = $state('');
	let searching = $state(false);
	let searchResults = $state<ScrapedContact[]>([]);
	let searchError = $state('');

	// Streamer
	let streamerHandle = $state('');
	let streamerPlatform = $state('Twitch');
	let streamerCallList = $state('');
	let lookingUp = $state(false);
	let streamerResult = $state<StreamerInfo | null>(null);

	// CSV
	let csvText = $state('');
	let csvHeaders = $state<string[]>([]);
	let csvTotalRows = $state(0);
	let csvMapping = $state<Record<string,string>>({ name: '', phone: '', email: '', company: '', title: '' });
	let csvCallList = $state('');
	let importing = $state(false);
	let importResult = $state<{imported:number;skipped:number}|null>(null);

	interface ScrapedContact {
		id: string; raw_name: string; raw_email: string; raw_phone: string;
		raw_title: string; raw_company: string; confidence: number; status: string; source: string; source_url?: string;
	}
	interface Contact { id: string; name: string; company: string; title: string; }
	interface Enrichment { companySummary: string; outreachAngle: string; personalizedMessage: string; talkingPoints: string[]; }
	interface CallList { id: string; name: string; }
	interface StreamerInfo { name?: string; handle?: string; platform?: string; game?: string; followers?: string; email?: string; bio?: string; confidence?: number; }

	onMount(async () => {
		const [hr, cr, lr] = await Promise.all([
			apiFetch('/api/scraper'),
			apiFetch('/api/contacts/filtered?limit=100'),
			apiFetch('/api/call-lists'),
		]);
		history = hr.ok ? await hr.json() : [];
		contacts = cr.ok ? await cr.json() : [];
		callLists = lr.ok ? await lr.json() : [];
		loadingHistory = false;
		loading = false;
	});

	async function scrapeWeb() {
		if (!scrapeUrl) return;
		scraping = true; scrapeError = '';
		try {
			const res = await apiFetch('/api/scraper', { method: 'POST', body: JSON.stringify({ mode: 'web', url: scrapeUrl }) });
			if (!res.ok) { const e = await res.json(); scrapeError = e.message ?? 'Scrape failed'; }
			else {
				const data = await res.json();
				scraped = data.contacts;
				history = [...data.contacts, ...history];
			}
		} catch (e) { scrapeError = String(e); }
		scraping = false;
	}

	function handleImageDrop(e: DragEvent) {
		e.preventDefault();
		const file = e.dataTransfer?.files[0];
		if (file && file.type.startsWith('image/')) loadImage(file);
	}

	function handleImageInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) loadImage(file);
	}

	function loadImage(file: File) {
		imgFile = file;
		const reader = new FileReader();
		reader.onload = (e) => { imgPreview = e.target?.result as string; };
		reader.readAsDataURL(file);
	}

	async function extractScreenshot() {
		if (!imgFile) return;
		extracting = true; extracted = null;
		const reader = new FileReader();
		reader.onload = async (e) => {
			const dataUrl = e.target?.result as string;
			const base64 = dataUrl.split(',')[1];
			const res = await apiFetch('/api/scraper', {
				method: 'POST',
				body: JSON.stringify({ mode: 'screenshot', imageBase64: base64, imageType: imgFile!.type }),
			});
			if (res.ok) {
				const data = await res.json();
				extracted = data.extracted;
				if (data.saved) history = [data.saved, ...history];
			}
			extracting = false;
		};
		reader.readAsDataURL(imgFile);
	}

	async function enrichContact() {
		const contact = contacts.find(c => c.id === selectedContact);
		if (!contact) return;
		enriching = true; enrichment = null;
		const res = await apiFetch('/api/scraper', {
			method: 'POST',
			body: JSON.stringify({
				mode: 'enrich', contactId: contact.id,
				contactName: contact.name, contactTitle: contact.title, contactCompany: contact.company,
			}),
		});
		if (res.ok) {
			const data = await res.json();
			enrichment = {
				...data.enrichment,
				talkingPoints: Array.isArray(data.enrichment.talkingPoints)
					? data.enrichment.talkingPoints
					: JSON.parse(data.enrichment.talkingPoints ?? '[]'),
			};
		}
		enriching = false;
	}

	async function acceptContact(id: string) {
		const res = await apiFetch('/api/scraper/accept', { method: 'POST', body: JSON.stringify({ scrapedId: id }) });
		if (res.ok) {
			history = history.map(h => h.id === id ? { ...h, status: 'added' } : h);
			scraped = scraped.map(s => s.id === id ? { ...s, status: 'added' } : s);
		}
	}

	async function runSearch() {
		if (!searchQuery.trim() || searching) return;
		searching = true; searchError = ''; searchResults = [];
		const r = await apiFetch('/api/scraper', { method: 'POST', body: JSON.stringify({ mode: 'search', query: searchQuery, callListId: searchCallList || undefined }) });
		if (r.ok) { const d = await r.json(); searchResults = d.contacts ?? []; history = [...(d.contacts ?? []), ...history]; }
		else searchError = 'Search failed. Try a more specific query.';
		searching = false;
	}

	async function lookupStreamer() {
		if (!streamerHandle.trim() || lookingUp) return;
		lookingUp = true; streamerResult = null;
		const r = await apiFetch('/api/scraper', { method: 'POST', body: JSON.stringify({ mode: 'streamer', handle: streamerHandle, platform: streamerPlatform, callListId: streamerCallList || undefined }) });
		if (r.ok) { const d = await r.json(); streamerResult = d.info ?? null; if (d.saved) history = [d.saved, ...history]; }
		lookingUp = false;
	}

	async function previewCsv() {
		const r = await apiFetch('/api/scraper', { method: 'POST', body: JSON.stringify({ mode: 'csv_preview', csvText }) });
		if (r.ok) { const d = await r.json(); csvHeaders = d.headers ?? []; csvTotalRows = d.totalRows ?? 0; }
	}

	async function importCsv() {
		importing = true; importResult = null;
		const r = await apiFetch('/api/scraper', { method: 'POST', body: JSON.stringify({ mode: 'csv_import', csvText, mapping: csvMapping, callListId: csvCallList || undefined }) });
		if (r.ok) {
			importResult = await r.json();
			const hr = await apiFetch('/api/scraper');
			if (hr.ok) history = await hr.json();
			csvHeaders = []; csvText = '';
		}
		importing = false;
	}

	function confColor(c: number) {
		if (c >= 0.85) return 'text-green-400';
		if (c >= 0.65) return 'text-yellow-400';
		return 'text-red-400';
	}
</script>

<svelte:head><title>Lead Gen — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<!-- Header + tabs -->
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 class="text-white text-sm font-medium mb-3">Lead Generation</h2>
		<div class="flex gap-1 flex-wrap">

	{#if loading}
		<div class="flex-1 p-8 space-y-3">
			{#each [1,2,3,4,5] as _}
				<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			{/each}
		</div>
	{:else}

			{#each ([['web','Web Scraper'],['screenshot','Screenshot OCR'],['enrich','AI Enrichment'],['search','Biz Search'],['streamer','Streamer Lookup'],['csv','CSV Import']] as [Tab,string][]) as [t, label]}
				<button onclick={() => tab = t}
					class="rounded-lg px-4 py-1.5 text-xs transition-colors {tab === t ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">
					{label}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Left: tool panel -->
		<div class="w-96 shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-y-auto p-6 space-y-4">

			{#if tab === 'web'}
				<div>
					<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Scrape Company Website</p>
					<p class="text-xs text-[#555] mb-4">Enter a company URL. Claude will extract contacts, emails, and titles from the page.</p>
					<div class="flex gap-2">
						<input bind:value={scrapeUrl} placeholder="https://company.com/team"
							onkeydown={(e) => e.key === 'Enter' && scrapeWeb()}
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<button onclick={scrapeWeb} disabled={scraping || !scrapeUrl}
							class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors whitespace-nowrap">
							{scraping ? 'Scraping...' : 'Scrape'}
						</button>
					</div>
					{#if scrapeError}<p class="text-xs text-red-400 mt-2">{scrapeError}</p>{/if}
					{#if scraped.length > 0}
						<p class="text-xs text-green-400 mt-3">Found {scraped.length} contact{scraped.length !== 1 ? 's' : ''}</p>
					{/if}
				</div>

			{:else if tab === 'screenshot'}
				<div>
					<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Extract from Screenshot</p>
					<p class="text-xs text-[#555] mb-4">Upload a screenshot of a business card, LinkedIn profile, or any page with contact info. Claude Vision extracts the details.</p>
					<div
						role="button" tabindex="0"
						class="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors border-[#2a2a2a] hover:border-[#444]"
						ondragover={(e) => e.preventDefault()}
						ondrop={handleImageDrop}
						onclick={() => document.getElementById('img-input')?.click()}
						onkeydown={(e) => e.key === 'Enter' && document.getElementById('img-input')?.click()}>
						{#if imgPreview}
							<img src={imgPreview} alt="preview" class="max-h-40 mx-auto rounded-lg object-contain" />
						{:else}
							<p class="text-[#666] text-sm">Drop image or click to upload</p>
							<p class="text-[#444] text-xs mt-1">PNG, JPG, WebP</p>
						{/if}
						<input id="img-input" type="file" accept="image/*" class="hidden" onchange={handleImageInput} />
					</div>
					{#if imgFile}
						<button onclick={extractScreenshot} disabled={extracting}
							class="w-full rounded-lg bg-white py-2.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
							{extracting ? 'Extracting with Claude Vision...' : 'Extract Contact Info'}
						</button>
					{/if}
					{#if extracted}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-2 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Extracted</p>
							{#each [['Name', extracted.raw_name], ['Title', extracted.raw_title], ['Company', extracted.raw_company], ['Email', extracted.raw_email], ['Phone', extracted.raw_phone]] as [label, val]}
								{#if val}<div><p class="text-xs text-[#555]">{label}</p><p class="text-white text-sm">{val}</p></div>{/if}
							{/each}
						</div>
					{/if}
				</div>

			{:else if tab === 'enrich'}
				<div>
					<p class="text-xs text-[#999] uppercase tracking-widest mb-3">AI Enrichment</p>
					<p class="text-xs text-[#555] mb-4">Select a contact and Claude generates a company summary, best outreach angle, personalized opener, and talking points.</p>
					<select bind:value={selectedContact}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none mb-3">
						<option value="">Select a contact...</option>
						{#each contacts as c}<option value={c.id}>{c.name} — {c.company}</option>{/each}
					</select>
					<button onclick={enrichContact} disabled={enriching || !selectedContact}
						class="w-full rounded-lg bg-white py-2.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
						{enriching ? 'Generating with Claude...' : 'Generate Enrichment'}
					</button>
					{#if enrichment}
						<div class="space-y-4 mt-4">
							{#if enrichment.companySummary}
								<div class="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
									<p class="text-xs text-[#555] mb-1 uppercase tracking-widest">Company</p>
									<p class="text-sm text-[#ccc]">{enrichment.companySummary}</p>
								</div>
							{/if}
							{#if enrichment.outreachAngle}
								<div class="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
									<p class="text-xs text-[#555] mb-1 uppercase tracking-widest">Outreach Angle</p>
									<p class="text-sm text-[#ccc]">{enrichment.outreachAngle}</p>
								</div>
							{/if}
							{#if enrichment.personalizedMessage}
								<div class="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
									<p class="text-xs text-[#555] mb-1 uppercase tracking-widest">Opening Line</p>
									<p class="text-sm text-white italic">"{enrichment.personalizedMessage}"</p>
								</div>
							{/if}
							{#if enrichment.talkingPoints?.length}
								<div class="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
									<p class="text-xs text-[#555] mb-2 uppercase tracking-widest">Talking Points</p>
									<ul class="space-y-1">
										{#each enrichment.talkingPoints as pt}
											<li class="text-sm text-[#ccc] flex gap-2"><span class="text-[#444]">•</span>{pt}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}
				</div>

			{:else if tab === 'search'}
				<div class="space-y-4">
					<p class="text-xs text-[#999] uppercase tracking-widest">Business Directory Search</p>
					<p class="text-xs text-[#555]">Search for businesses and extract real contact data from their websites.</p>
					<div class="flex gap-2">
						<input bind:value={searchQuery} placeholder="e.g. auto mechanics Tampa FL"
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none"
							onkeydown={(e) => e.key === 'Enter' && runSearch()} />
					</div>
					<div class="flex gap-2">
						<select bind:value={searchCallList} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-xs text-white focus:outline-none">
							<option value="">No call list</option>
							{#each callLists as cl}<option value={cl.id}>{cl.name}</option>{/each}
						</select>
						<button onclick={runSearch} disabled={searching || !searchQuery.trim()}
							class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
							{searching ? 'Searching...' : 'Search'}
						</button>
					</div>
					{#if searchError}<p class="text-xs text-red-400">{searchError}</p>{/if}
					{#if searchResults.length > 0}
						<p class="text-xs text-green-400">Found {searchResults.length} contacts — review in the inbox panel.</p>
					{/if}
				</div>

			{:else if tab === 'streamer'}
				<div class="space-y-4">
					<p class="text-xs text-[#999] uppercase tracking-widest">Streamer Lookup</p>
					<p class="text-xs text-[#555]">Look up a gaming creator by handle. Extracts profile info and saves to your scraper inbox.</p>
					<div class="flex gap-2">
						<input bind:value={streamerHandle} placeholder="e.g. Jynxzi"
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<select bind:value={streamerPlatform} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-xs text-white focus:outline-none">
							<option value="Twitch">Twitch</option>
							<option value="YouTube">YouTube</option>
							<option value="Kick">Kick</option>
						</select>
					</div>
					<div class="flex gap-2">
						<select bind:value={streamerCallList} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-xs text-white focus:outline-none">
							<option value="">No call list</option>
							{#each callLists as cl}<option value={cl.id}>{cl.name}</option>{/each}
						</select>
						<button onclick={lookupStreamer} disabled={lookingUp || !streamerHandle.trim()}
							class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
							{lookingUp ? 'Looking up...' : 'Lookup'}
						</button>
					</div>
					{#if streamerResult}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 text-xs space-y-1 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-white font-medium">{streamerResult.name ?? streamerHandle}</p>
							<p class="text-[#555]">{streamerResult.game ?? ''}{streamerResult.game && streamerResult.followers ? ' · ' : ''}{streamerResult.followers ?? ''} followers</p>
							{#if streamerResult.email}<p class="text-green-400">{streamerResult.email}</p>{/if}
							{#if streamerResult.bio}<p class="text-[#777] mt-1">{streamerResult.bio}</p>{/if}
						</div>
					{/if}
				</div>

			{:else if tab === 'csv'}
				<div class="space-y-4">
					<p class="text-xs text-[#999] uppercase tracking-widest">CSV Import</p>
					{#if !csvHeaders.length}
						<p class="text-xs text-[#555]">Paste your CSV below. We'll help you map the columns.</p>
						<textarea bind:value={csvText} placeholder="Paste CSV here..." rows="6"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none resize-none font-mono"></textarea>
						<div class="flex gap-2">
							<select bind:value={csvCallList} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-2 text-xs text-white focus:outline-none">
								<option value="">Select call list (optional)</option>
								{#each callLists as cl}<option value={cl.id}>{cl.name}</option>{/each}
							</select>
							<button onclick={previewCsv} disabled={!csvText.trim()}
								class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
								Preview & Map
							</button>
						</div>
					{:else}
						<p class="text-xs text-[#888]">Map your CSV columns to LeadOS fields. {csvTotalRows} rows detected.</p>
						<div class="grid grid-cols-2 gap-3">
							{#each [['name','Name / Business'],['phone','Phone'],['email','Email'],['company','Company'],['title','Title']] as [field, label]}
								<div>
									<label class="text-xs text-[#555] mb-1 block">{label}</label>
									<select bind:value={csvMapping[field]} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:outline-none">
										<option value="">— skip —</option>
										{#each csvHeaders as h}<option value={h}>{h}</option>{/each}
									</select>
								</div>
							{/each}
						</div>
						<div class="flex gap-2 pt-1">
							<button onclick={() => { csvHeaders = []; csvText = ''; }} class="text-xs text-[#555] hover:text-white border border-[#2a2a2a] px-3 py-1.5 rounded-lg">Back</button>
							<button onclick={importCsv} disabled={importing}
								class="flex-1 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
								{importing ? 'Importing...' : `Import ${csvTotalRows} rows`}
							</button>
						</div>
					{/if}
					{#if importResult}
						<p class="text-xs text-green-400">Imported {importResult.imported} contacts. {importResult.skipped} skipped (empty rows).</p>
					{/if}
				</div>

			{/if}
		</div>

		<!-- Right: scraped contacts history -->
		<div class="flex-1 flex flex-col overflow-hidden">
			<div class="border-b border-[#1e1e1e] px-5 py-3">
				<p class="text-xs text-white font-medium">Scraped Contacts <span class="text-[#444] font-normal">({history.length})</span></p>
			</div>
			<div class="flex-1 overflow-y-auto">
				{#if loadingHistory}
					<p class="text-[#444] text-xs text-center py-8">Loading...</p>
				{:else if history.length === 0}
					<div class="flex items-center justify-center py-16 text-center">
						<div>
							<p class="text-[#444] text-sm">No scraped contacts yet</p>
							<p class="text-[#333] text-xs mt-1">Use the Web Scraper or Screenshot tool to find leads</p>
						</div>
					</div>
				{:else}
					{#each history as contact}
						<div class="flex items-center gap-4 px-8 py-4 border-b border-[#1e1e1e] hover:bg-[#111] transition-colors">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<p class="text-white text-sm font-medium truncate">{contact.raw_name ?? '—'}</p>
									<span class="text-xs {confColor(contact.confidence)}">{Math.round(contact.confidence * 100)}%</span>
								</div>
								<p class="text-xs text-[#666] truncate">{[contact.raw_title, contact.raw_company].filter(Boolean).join(' · ')}</p>
								{#if contact.raw_email}<p class="text-xs text-[#555] truncate">{contact.raw_email}</p>{/if}
							</div>
							<div class="text-right shrink-0">
								<p class="text-xs text-[#444] capitalize mb-1">{contact.source?.replace(/_/g,' ')}</p>
								{#if contact.status === 'added'}
									<p class="text-xs text-green-400">✓ Added</p>
								{:else if contact.status === 'rejected'}
									<p class="text-xs text-[#444]">Rejected</p>
								{:else}
									<button onclick={() => acceptContact(contact.id)}
										class="rounded px-2 py-1 text-xs bg-white/10 text-white hover:bg-white/20 transition-colors">
										+ Add Contact
									</button>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}
</div>
