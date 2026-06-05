<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastError } from '$lib/stores/toast';

	type Mode = 'geo' | 'web' | 'keyword';
	let mode = $state<Mode>('geo');

	interface ScrapedContact {
		id: string;
		raw_name: string | null;
		raw_email: string | null;
		raw_phone: string | null;
		raw_title: string | null;
		raw_company: string | null;
		confidence: number;
		status: string;
		source: string;
		source_url?: string | null;
		source_query?: string | null;
		notes?: string | null;
	}
	interface CallList { id: string; name: string; }
	interface Campaign { id: string; name: string; }
	interface City { name: string; lat: number; lng: number; }

	// ── Shared ────────────────────────────────────────────────────────────────
	let callLists = $state<CallList[]>([]);
	let callListId = $state('');
	let campaigns = $state<Campaign[]>([]);
	let campaignId = $state('');
	let results = $state<ScrapedContact[]>([]);
	let history = $state<ScrapedContact[]>([]);
	let loading = $state(true);
	let running = $state(false);
	let errorMsg = $state('');
	let statusMsg = $state('');

	// ── Geo (Google Places) — mirrors the standalone scraper defaults ──────────
	let cities = $state<City[]>([
		{ name: 'Albuquerque NM',   lat: 35.0844, lng: -106.6504 },
		{ name: 'Santa Fe NM',      lat: 35.6870, lng: -105.9378 },
		{ name: 'Flagstaff AZ',     lat: 35.1945, lng: -111.6553 },
		{ name: 'Kingman AZ',       lat: 35.1882, lng: -114.0533 },
		{ name: 'Oklahoma City OK', lat: 35.4676, lng: -97.5164 },
	]);
	let queriesText = $state('Catholic church, cannabis dispensary');
	let radius = $state(15000);

	// ── Web URL ────────────────────────────────────────────────────────────────
	let scrapeUrl = $state('');

	// ── Keyword search ──────────────────────────────────────────────────────────
	let keyword = $state('');

	const queries = $derived(queriesText.split(',').map((q) => q.trim()).filter(Boolean));
	const totalShown = $derived(results.length + history.length);

	onMount(async () => {
		const [hr, lr, cr] = await Promise.all([
			apiFetch('/api/scraper'),
			apiFetch('/api/call-lists'),
			apiFetch('/api/campaigns'),
		]);
		history = hr.ok ? await hr.json() : [];
		callLists = lr.ok ? await lr.json() : [];
		campaigns = cr.ok ? await cr.json() : [];
		loading = false;
	});

	function addCity() {
		cities = [...cities, { name: '', lat: 0, lng: 0 }];
	}
	function removeCity(i: number) {
		cities = cities.filter((_, idx) => idx !== i);
	}

	function flash(msg: string) {
		statusMsg = msg;
		setTimeout(() => { if (statusMsg === msg) statusMsg = ''; }, 4000);
	}

	async function post(body: Record<string, unknown>) {
		running = true; errorMsg = ''; statusMsg = '';
		try {
			const res = await apiFetch('/api/scraper', { method: 'POST', body: JSON.stringify(body) });
			if (!res.ok) {
				const e = await res.json().catch(() => ({}));
				errorMsg = e.message ?? `Request failed (${res.status})`;
				return;
			}
			const data = await res.json();
			const found: ScrapedContact[] = data.contacts ?? [];
			results = [...found, ...results];
			history = [...found, ...history];
			flash(
				typeof data.scanned === 'number'
					? `${data.found} saved · ${data.scanned} places scanned`
					: `${data.found ?? found.length} new lead${(data.found ?? found.length) === 1 ? '' : 's'}`,
			);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	function runGeo() {
		if (cities.length === 0 || queries.length === 0) {
			errorMsg = 'Add at least one city and one query.';
			return;
		}
		post({ mode: 'places', cities, queries, radius: Number(radius), callListId: callListId || undefined, campaignId: campaignId || undefined });
	}
	function runWeb() {
		if (!scrapeUrl.trim()) { errorMsg = 'Enter a URL.'; return; }
		post({ mode: 'web', url: scrapeUrl.trim() });
	}
	function runKeyword() {
		if (!keyword.trim()) { errorMsg = 'Enter a search query.'; return; }
		post({ mode: 'search', query: keyword.trim(), callListId: callListId || undefined, campaignId: campaignId || undefined });
	}

	async function accept(c: ScrapedContact) {
		const res = await apiFetch('/api/scraper/accept', {
			method: 'POST',
			body: JSON.stringify({ scrapedId: c.id }),
		});
		if (res.ok) {
			c.status = 'added';
			results = results;
			history = history;
			flash('Added to Contacts.');
		} else {
			errorMsg = 'Could not add to contacts.';
			toastError('Could not add to contacts — try again');
		}
	}

	function csvEscape(v: unknown): string {
		const s = v === null || v === undefined ? '' : String(v);
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	}

	function exportCsv() {
		const rows = (results.length ? results : history);
		if (!rows.length) { errorMsg = 'Nothing to export yet.'; return; }
		const headers = ['Name', 'Address', 'City / Notes', 'Phone', 'Email', 'Search Type', 'Source', 'Confidence', 'Status'];
		const lines = [headers.join(',')];
		for (const r of rows) {
			lines.push([
				r.raw_name, r.raw_title, r.notes, r.raw_phone, r.raw_email,
				r.source_query, r.source, r.confidence, r.status,
			].map(csvEscape).join(','));
		}
		const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'edelhaus-leads.csv';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	const MODES: { id: Mode; label: string; hint: string }[] = [
		{ id: 'geo',     label: 'Geo Search',     hint: 'Google Places · cities × queries' },
		{ id: 'web',     label: 'Web URL',        hint: 'Extract contacts from a page' },
		{ id: 'keyword', label: 'Keyword',        hint: 'Search the web for businesses' },
	];
</script>

<div class="wrap">
	<header class="head">
		<div>
			<h1 class="font-display title">Edelhaus Scraper</h1>
			<p class="sub">Pull leads into Edelhaus — geo-targeted Places search, single pages, or open-web keyword sweeps.</p>
		</div>
		<button class="btn ghost" onclick={exportCsv} disabled={totalShown === 0}>Export CSV</button>
	</header>

	<!-- Mode switcher -->
	<div class="tabs">
		{#each MODES as m (m.id)}
			<button class="tab" class:active={mode === m.id} onclick={() => (mode = m.id)}>
				<span class="tab-label">{m.label}</span>
				<span class="tab-hint">{m.hint}</span>
			</button>
		{/each}
	</div>

	<!-- Panel -->
	<section class="panel">
		{#if mode === 'geo'}
			<div class="field-grid">
				<label class="field">
					<span class="font-label">Search queries (comma-separated)</span>
					<input class="input" bind:value={queriesText} placeholder="Catholic church, cannabis dispensary" />
				</label>
				<label class="field narrow">
					<span class="font-label">Radius (m)</span>
					<input class="input tabular-nums" type="number" min="1000" step="1000" bind:value={radius} />
				</label>
				<label class="field narrow">
					<span class="font-label">Assign to campaign</span>
					<select class="input" bind:value={campaignId}>
						<option value="">— none —</option>
						{#each campaigns as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="field narrow">
					<span class="font-label">Assign to call list</span>
					<select class="input" bind:value={callListId}>
						<option value="">— none —</option>
						{#each callLists as l (l.id)}
							<option value={l.id}>{l.name}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="cities">
				<div class="cities-head">
					<span class="font-label">Cities ({cities.length})</span>
					<button class="btn-link" onclick={addCity}>+ Add city</button>
				</div>
				{#each cities as city, i (i)}
					<div class="city-row">
						<input class="input" bind:value={city.name} placeholder="City name" />
						<input class="input tabular-nums" type="number" step="0.0001" bind:value={city.lat} placeholder="lat" />
						<input class="input tabular-nums" type="number" step="0.0001" bind:value={city.lng} placeholder="lng" />
						<button class="x" onclick={() => removeCity(i)} aria-label="Remove city"><Icon name="x" size={14} /></button>
					</div>
				{/each}
			</div>

			<div class="actions">
				<button class="btn primary" onclick={runGeo} disabled={running}>
					{running ? 'Scanning…' : `Run geo search (${cities.length} × ${queries.length})`}
				</button>
				<span class="hint">Each city × query is paginated to 60 results, then deduped by place. Phones via Place Details.</span>
			</div>

		{:else if mode === 'web'}
			<label class="field">
				<span class="font-label">Page URL</span>
				<input class="input" bind:value={scrapeUrl} placeholder="https://example.com/team" />
			</label>
			<div class="actions">
				<button class="btn primary" onclick={runWeb} disabled={running}>
					{running ? 'Extracting…' : 'Extract contacts'}
				</button>
				<span class="hint">Fetches the page and uses Claude to pull names, phones, and emails.</span>
			</div>

		{:else}
			<div class="field-grid">
				<label class="field">
					<span class="font-label">Search query</span>
					<input class="input" bind:value={keyword} placeholder="HVAC contractors Albuquerque" />
				</label>
				<label class="field narrow">
					<span class="font-label">Assign to campaign</span>
					<select class="input" bind:value={campaignId}>
						<option value="">— none —</option>
						{#each campaigns as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="field narrow">
					<span class="font-label">Assign to call list</span>
					<select class="input" bind:value={callListId}>
						<option value="">— none —</option>
						{#each callLists as l (l.id)}
							<option value={l.id}>{l.name}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="actions">
				<button class="btn primary" onclick={runKeyword} disabled={running}>
					{running ? 'Searching…' : 'Search the web'}
				</button>
				<span class="hint">Finds business sites via search, then extracts contacts from the top results.</span>
			</div>
		{/if}

		{#if errorMsg}
			<div class="banner err">{errorMsg}</div>
		{:else if statusMsg}
			<div class="banner ok">{statusMsg}</div>
		{/if}
	</section>

	<!-- Results -->
	<section class="results">
		<div class="results-head">
			<span class="font-label">{results.length ? `Latest run · ${results.length}` : `History · ${history.length}`}</span>
		</div>

		{#if loading}
			<div class="empty">Loading…</div>
		{:else}
			{@const rows = results.length ? results : history}
			{#if rows.length === 0}
				<div class="empty">No leads yet. Run a search above to populate this table.</div>
			{:else}
				<div class="table-scroll">
					<table class="table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Phone</th>
								<th>Address / Title</th>
								<th>City / Notes</th>
								<th>Type</th>
								<th class="num">Conf.</th>
								<th>Source</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each rows as c (c.id)}
								<tr>
									<td class="strong">{c.raw_name || '—'}</td>
									<td class="tabular-nums">{c.raw_phone || '—'}</td>
									<td class="muted">{c.raw_title || c.raw_company || '—'}</td>
									<td class="muted">{c.notes || '—'}</td>
									<td class="muted">{c.source_query || c.source}</td>
									<td class="num tabular-nums">{Math.round((c.confidence ?? 0) * 100)}%</td>
									<td><span class="chip">{c.source}</span></td>
									<td class="right">
										{#if c.status === 'added'}
											<span class="added">✓ Added</span>
										{:else}
											<button class="btn-link" onclick={() => accept(c)}>Add</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--s-8) var(--s-6) 96px;
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.title { font-size: var(--text-title); color: var(--c-text-primary); margin: 0; }
	.sub { color: var(--c-text-secondary); font-size: var(--text-body); margin: 6px 0 0; max-width: 56ch; }

	/* Tabs */
	.tabs { display: flex; gap: var(--s-2); flex-wrap: wrap; }
	.tab {
		flex: 1 1 200px;
		text-align: left;
		background: var(--c-card);
		border: 1px solid var(--c-border);
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		cursor: pointer;
		transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.tab:hover { border-color: var(--c-border-subtle); }
	.tab.active { border-color: var(--c-text-primary); background: var(--c-input); }
	.tab-label { font-size: var(--text-body); color: var(--c-text-primary); font-weight: 500; }
	.tab-hint { font-size: var(--text-meta); color: var(--c-text-muted); }

	/* Panel */
	.panel {
		background: var(--c-card);
		border: 1px solid var(--c-border);
		border-radius: var(--r-lg);
		padding: var(--s-6);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}

	.field-grid { display: flex; gap: var(--s-4); flex-wrap: wrap; }
	.field { display: flex; flex-direction: column; gap: var(--s-2); flex: 1 1 260px; }
	.field.narrow { flex: 0 1 180px; }
	.field > .font-label { color: var(--c-text-muted); }

	.input {
		background: var(--c-input);
		border: 1px solid var(--c-border);
		border-radius: var(--r-sm);
		color: var(--c-text-primary);
		font-family: var(--font-ui);
		font-size: var(--text-body);
		padding: 9px 11px;
		width: 100%;
		transition: border-color var(--dur-fast) var(--ease-out);
	}
	.input:focus { outline: none; border-color: var(--c-border-subtle); }
	.input::placeholder { color: var(--c-text-faint); }
	select.input { cursor: pointer; }

	/* Cities editor */
	.cities { display: flex; flex-direction: column; gap: var(--s-2); }
	.cities-head { display: flex; align-items: center; justify-content: space-between; }
	.city-row {
		display: grid;
		grid-template-columns: 1fr 130px 130px 32px;
		gap: var(--s-2);
		align-items: center;
	}
	.x {
		background: transparent;
		border: 1px solid var(--c-border);
		border-radius: var(--r-sm);
		color: var(--c-text-muted);
		cursor: pointer;
		height: 36px;
		font-size: 11px;
		transition: color var(--dur-fast), border-color var(--dur-fast);
	}
	.x:hover { color: var(--c-danger); border-color: var(--c-danger-border); }

	/* Actions */
	.actions { display: flex; align-items: center; gap: var(--s-4); flex-wrap: wrap; }
	.hint { color: var(--c-text-muted); font-size: var(--text-meta); }

	.btn {
		font-family: var(--font-ui);
		font-size: var(--text-body);
		border-radius: var(--r-sm);
		padding: 9px 16px;
		cursor: pointer;
		border: 1px solid var(--c-border);
		background: var(--c-input);
		color: var(--c-text-primary);
		transition: background var(--dur-fast), border-color var(--dur-fast), opacity var(--dur-fast);
	}
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn.primary { background: var(--c-accent); color: var(--c-accent-text); border-color: var(--c-accent); font-weight: 500; }
	.btn.primary:hover:not(:disabled) { background: var(--c-accent-hover); }
	.btn.ghost:hover:not(:disabled) { border-color: var(--c-border-subtle); }

	.btn-link {
		background: none;
		border: none;
		color: var(--c-text-secondary);
		cursor: pointer;
		font-size: var(--text-meta);
		padding: 2px 4px;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.btn-link:hover { color: var(--c-text-primary); }

	/* Banner */
	.banner { border-radius: var(--r-sm); padding: 9px 12px; font-size: var(--text-meta); }
	.banner.err { background: var(--c-danger-bg); border: 1px solid var(--c-danger-border); color: var(--c-danger-hover); }
	.banner.ok { background: var(--c-success-bg); border: 1px solid var(--c-success-border); color: var(--c-success); }

	/* Results */
	.results {
		background: var(--c-card);
		border: 1px solid var(--c-border);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.results-head { padding: var(--s-4) var(--s-5); border-bottom: 1px solid var(--c-border-ghost); }
	.empty { padding: var(--s-8); text-align: center; color: var(--c-text-muted); font-size: var(--text-body); }

	.table-scroll { overflow-x: auto; }
	.table { width: 100%; border-collapse: collapse; font-size: var(--text-body); }
	.table th {
		text-align: left;
		font-family: var(--font-label);
		font-size: var(--text-label);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--c-text-faint);
		font-weight: 400;
		padding: 10px var(--s-4);
		border-bottom: 1px solid var(--c-border-ghost);
		white-space: nowrap;
	}
	.table td {
		padding: 11px var(--s-4);
		border-bottom: 1px solid var(--c-border-ghost);
		color: var(--c-text-secondary);
		vertical-align: middle;
	}
	.table tbody tr:hover { background: var(--c-input); }
	.table .strong { color: var(--c-text-primary); font-weight: 500; }
	.table .muted { color: var(--c-text-muted); }
	.table .num, .table th.num { text-align: right; }
	.table .right { text-align: right; }

	.chip {
		display: inline-block;
		background: var(--c-input);
		border: 1px solid var(--c-border);
		border-radius: 999px;
		padding: 2px 9px;
		font-size: var(--text-micro);
		color: var(--c-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.added { color: var(--c-success); font-size: var(--text-meta); }
</style>
