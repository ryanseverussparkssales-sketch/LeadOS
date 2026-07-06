<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import { page } from '$app/stores';
	import {
		WIDGET_REGISTRY,
		TOP_BAND_WIDGETS,
		ALL_WIDGETS,
		getDefaultSlot,
	} from '$lib/widgetRegistry';

	const LAYOUT_KEY = 'rogueos_dashboard_layout';
	const TOP_BAND_KEY = 'rogueos_top_band';

	let topBand = $state<string[]>([]);
	let editingTopBand = $state(false);

	interface WidgetSlot {
		id: string;
		type: string;
		cols: 1 | 2 | 3;            // grid column span (1=2/6, 2=4/6, 3=6/6)
		rows: 'sm' | 'md' | 'lg' | 'xl'; // height preset
	}

	const rowHeights: Record<string, number> = { sm: 150, md: 260, lg: 380, xl: 520 };

	// Widget types that can be added multiple times — derived from registry
	const MULTI_INSTANCE_TYPES = new Set(
		ALL_WIDGETS.filter(w => w.multiInstance).map(w => w.type)
	);

	const DEFAULT_LAYOUT: WidgetSlot[] = [
		{ id: 'w1', type: 'timer',        cols: 1, rows: 'md' },
		{ id: 'w2', type: 'stats',        cols: 1, rows: 'md' },
		{ id: 'w3', type: 'recent-calls', cols: 2, rows: 'md' },
		{ id: 'w4', type: 'chat',         cols: 3, rows: 'lg' },
	];

	let layout = $state<WidgetSlot[]>([]);
	let showPicker = $state(false);
	let greeting = $state('');
	let dashboardLoading = $state(true);

	// ── Hero KPI band ────────────────────────────────────────────────────────
	// Reuses two existing endpoints (no new endpoints): /api/agency for today's
	// dialing stats + connect rate, /api/deals/forecast for weighted pipeline.
	// Each source is fetched independently and fails soft — a missing source
	// leaves its numbers null (rendered as "—"), never fabricated.
	let heroLoading = $state(true);
	let heroConnectRate = $state<number | null>(null);
	let heroDials = $state<number | null>(null);
	let heroWins = $state<number | null>(null);
	let heroPipeline = $state<number | null>(null);

	function formatPipeline(v: number): string {
		if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M';
		if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
		return '$' + v;
	}

	async function loadHeroMetrics() {
		heroLoading = true;
		// Today's dialing stats + connect rate + wins
		try {
			const res = await apiFetch('/api/agency');
			if (res.ok) {
				const data = await res.json();
				const t = data?.teamTotals ?? {};
				heroConnectRate = typeof t.connectRate === 'number' ? t.connectRate : null;
				heroDials = typeof t.dials === 'number' ? t.dials : null;
				heroWins = typeof t.wins === 'number' ? t.wins : null;
			}
		} catch (e) {
			console.warn('[dashboard] hero agency stats failed (non-fatal):', e);
		}
		// Weighted pipeline (open deals)
		try {
			const res = await apiFetch('/api/deals/forecast');
			if (res.ok) {
				const data = await res.json();
				const w = data?.pipeline?.weighted;
				heroPipeline = typeof w === 'number' ? w : null;
			}
		} catch (e) {
			console.warn('[dashboard] hero forecast failed (non-fatal):', e);
		}
		heroLoading = false;
	}

	// Picker filter/search state
	let pickerCategory = $state<string>('all');
	let pickerSearch = $state('');

	// Drag-and-drop state
	let dragging = $state<string | null>(null);
	let dragOver = $state<string | null>(null);

	// Resize popover state
	let resizingWidgetId = $state<string | null>(null);

	$effect(() => {
		if (!resizingWidgetId) return;
		const handler = () => resizingWidgetId = null;
		setTimeout(() => document.addEventListener('click', handler, { once: true }), 0);
	});

	function safeParseLayout(raw: string | null): WidgetSlot[] | null {
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return null;
			return parsed.map((w: any) => ({ cols: 1, rows: 'md', ...w }));
		} catch {
			return null;
		}
	}

	onMount(async () => {
		// Load layout from server (falls back to localStorage then default)
		try {
			const res = await apiFetch('/api/preferences');
			if (res.ok) {
				let prefs: Record<string, unknown> = {};
				try { prefs = await res.json(); } catch { /* malformed JSON — use fallback */ }
				if (Array.isArray(prefs.dashboard_layout) && prefs.dashboard_layout.length) {
					// Normalize: fill cols/rows defaults for any saved layout missing them
					layout = (prefs.dashboard_layout as any[]).map((w: any) => ({ cols: 1, rows: 'md', ...w }));
				} else {
					// Migrate from localStorage if present
					layout = safeParseLayout(localStorage.getItem(LAYOUT_KEY)) ?? DEFAULT_LAYOUT;
				}
			} else {
				layout = safeParseLayout(localStorage.getItem(LAYOUT_KEY)) ?? DEFAULT_LAYOUT;
			}
		} catch {
			layout = safeParseLayout(localStorage.getItem(LAYOUT_KEY)) ?? DEFAULT_LAYOUT;
		}

		// Greeting
		try {
			const h = new Date().getHours();
			greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
		} catch {
			greeting = 'Hello';
		}

		// Hero KPI band — fire-and-forget; renders skeletons until resolved
		loadHeroMetrics();

		// Check for Spotify OAuth result
		try {
			const spotifyResult = $page.url.searchParams.get('spotify');
			const spotifyError = $page.url.searchParams.get('spotify_error');
			if (spotifyResult === 'connected') {
				toastSuccess('Spotify connected');
			}
			if (spotifyError) {
				console.error('[spotify] OAuth error:', spotifyError);
				toastError('Spotify connection failed');
			}
		} catch { /* non-fatal */ }

		dashboardLoading = false;

		// Load top band
		try {
			const storedBand = localStorage.getItem(TOP_BAND_KEY);
			if (storedBand) {
				const parsed = JSON.parse(storedBand);
				topBand = Array.isArray(parsed) ? parsed : ['chrono-nexus', 'transmission', 'signal-array', 'neural-grid'];
			} else {
				topBand = ['chrono-nexus', 'transmission', 'signal-array', 'neural-grid'];
			}
		} catch {
			topBand = ['chrono-nexus', 'transmission', 'signal-array', 'neural-grid'];
		}
	});

	function saveTopBand() {
		localStorage.setItem(TOP_BAND_KEY, JSON.stringify(topBand));
	}
	function addTopBand(type: string) {
		if (topBand.includes(type) || topBand.length >= 4) return;
		topBand = [...topBand, type];
		saveTopBand();
	}
	function removeTopBand(type: string) {
		topBand = topBand.filter(t => t !== type);
		saveTopBand();
	}

	async function saveLayout() {
		// Persist to server + localStorage fallback
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
		try {
			await apiFetch('/api/preferences', {
				method: 'PUT',
				body: JSON.stringify({ dashboardLayout: layout }),
			});
		} catch (e) { console.warn('[dashboard] layout save failed (non-fatal, cached locally):', e); }
	}

	function addWidget(type: string) {
		const defaults = getDefaultSlot(type);
		const newSlot: WidgetSlot = {
			id: `w_${Date.now()}`,
			type,
			cols: defaults.cols,
			rows: defaults.rows,
		};
		layout = [...layout, newSlot];
		saveLayout();
		showPicker = false;
	}

	function removeWidget(id: string) {
		layout = layout.filter(w => w.id !== id);
		saveLayout();
	}

	function widgetLabel(type: string) {
		return WIDGET_REGISTRY[type]?.label ?? type;
	}

	// Resize controls
	function setWidgetCols(id: string, cols: 1 | 2 | 3) {
		layout = layout.map(w => w.id === id ? { ...w, cols } : w);
		saveLayout();
	}

	function setWidgetRows(id: string, rows: 'sm' | 'md' | 'lg' | 'xl') {
		layout = layout.map(w => w.id === id ? { ...w, rows } : w);
		saveLayout();
	}

	// Drag-and-drop handlers
	function onDragStart(e: DragEvent, id: string) {
		dragging = id;
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', id);
	}

	function onDragOver(e: DragEvent, id: string) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
		if (id !== dragging) dragOver = id;
	}

	function onDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		if (!dragging || dragging === targetId) return;
		const from = layout.findIndex(w => w.id === dragging);
		const to = layout.findIndex(w => w.id === targetId);
		if (from === -1 || to === -1) return;
		const newLayout = [...layout];
		const [item] = newLayout.splice(from, 1);
		newLayout.splice(to, 0, item);
		layout = newLayout;
		dragOver = null;
		dragging = null;
		saveLayout();
	}

	// Types already on board (to show "added" state in picker)
	const activeTypes = $derived(new Set(layout.map(w => w.type)));

	// Filtered widget list for picker
	const pickerWidgets = $derived(
		ALL_WIDGETS.filter(w =>
			(pickerCategory === 'all' || w.category === pickerCategory) &&
			(!pickerSearch || w.label.toLowerCase().includes(pickerSearch.toLowerCase()) || w.description.toLowerCase().includes(pickerSearch.toLowerCase()))
		)
	);
</script>

<svelte:head><title>{titleFor('Dashboard')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<!-- Header -->
	<PageHeader title={greeting} titleSize={26}>
		{#snippet sub()}
			<p class="mt-1" style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;color:var(--c-text-faint)">{new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }).toUpperCase()}</p>
		{/snippet}
		{#snippet actions()}
			<button onclick={() => showPicker = !showPicker}
				class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
				{showPicker ? 'Done' : '+ Add Widget'}
			</button>
		{/snippet}
	</PageHeader>

	<!-- Hero KPI band — F-pattern anchor: one focal number + supporting stats -->
	<div class="hero-band">
		<!-- Primary metric: today's connect rate — the single number the eye lands on -->
		<div class="hero-primary">
			<p class="hero-label">Connect Rate · Today</p>
			{#if heroLoading}
				<div class="hero-skel hero-skel-value"></div>
			{:else}
				<p class="hero-value">{heroConnectRate === null ? '—' : heroConnectRate + '%'}</p>
			{/if}
		</div>

		<!-- Supporting metrics: clearly secondary -->
		<div class="hero-supporting">
			<div class="hero-stat">
				<p class="hero-stat-label">Dials Today</p>
				{#if heroLoading}
					<div class="hero-skel hero-skel-stat"></div>
				{:else}
					<p class="hero-stat-value">{heroDials === null ? '—' : heroDials.toLocaleString()}</p>
				{/if}
			</div>
			<div class="hero-stat">
				<p class="hero-stat-label">Wins Today</p>
				{#if heroLoading}
					<div class="hero-skel hero-skel-stat"></div>
				{:else}
					<p class="hero-stat-value">{heroWins === null ? '—' : heroWins.toLocaleString()}</p>
				{/if}
			</div>
			<div class="hero-stat">
				<p class="hero-stat-label">Weighted Pipeline</p>
				{#if heroLoading}
					<div class="hero-skel hero-skel-stat"></div>
				{:else}
					<p class="hero-stat-value">{heroPipeline === null ? '—' : formatPipeline(heroPipeline)}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Configurable Top Band -->
	<div class="top-band-container">
		<div class="top-band-header">
			<span class="top-band-label">Widget Band</span>
			<button onclick={() => editingTopBand = !editingTopBand} class="top-band-edit">
				{editingTopBand ? 'Done' : '⚙ Configure'}
			</button>
		</div>

		{#if editingTopBand}
			<div class="top-band-picker">
				{#each TOP_BAND_WIDGETS as w}
					<button
						onclick={() => topBand.includes(w.type) ? removeTopBand(w.type) : addTopBand(w.type)}
						class="top-band-option {topBand.includes(w.type) ? 'active' : ''} {topBand.length >= 4 && !topBand.includes(w.type) ? 'disabled' : ''}">
						{topBand.includes(w.type) ? '✓ ' : '+ '}{w.label}
					</button>
				{/each}
				<p class="top-band-hint">Max 4 widgets in band</p>
			</div>
		{/if}

		{#if topBand.length > 0}
			<div class="cyber-widgets-grid" style="grid-template-columns: repeat({topBand.length}, 1fr);">
				{#each topBand as wtype}
					{@const bandDef = WIDGET_REGISTRY[wtype]}
					{#if bandDef?.component}
						<svelte:component this={bandDef.component} />
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Widget picker dropdown -->
	{#if showPicker}
		<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] px-8 py-4">
			<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Available Widgets</p>
			<div class="space-y-4">
				<!-- Category filter -->
				<div class="flex gap-2 flex-wrap">
					<button onclick={() => pickerCategory = 'all'}
						class="px-3 py-1 rounded-lg text-xs {pickerCategory === 'all' ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#7c7c7c] hover:text-white'}">
						All
					</button>
					{#each (['productivity','sales','comms','tools','flair'] as const) as cat}
						<button onclick={() => pickerCategory = cat}
							class="px-3 py-1 rounded-lg text-xs capitalize {pickerCategory === cat ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#7c7c7c] hover:text-white'}">
							{cat}
						</button>
					{/each}
				</div>

				<!-- Search -->
				<input bind:value={pickerSearch} placeholder="Search widgets..."
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />

				<!-- Widget grid -->
				<div class="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
					{#each pickerWidgets as widgetDef}
						{@const alreadyAdded = !widgetDef.multiInstance && activeTypes.has(widgetDef.type)}
						<button onclick={() => !alreadyAdded && addWidget(widgetDef.type)}
							disabled={alreadyAdded}
							class="text-left rounded-xl border p-3 transition-colors {alreadyAdded ? 'border-[#1a1a1a] opacity-40 cursor-default' : 'border-[#2a2a2a] hover:border-white hover:bg-white/5'}">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-base">{widgetDef.icon}</span>
								<p class="text-xs font-semibold text-white">{widgetDef.label}</p>
							</div>
							<p class="text-[10px] text-[#6e6e6e] leading-relaxed">{widgetDef.description}</p>
							{#if !alreadyAdded && widgetDef.multiInstance && activeTypes.has(widgetDef.type)}
								<p class="text-xs text-[#3b82f6] mt-1">+ Add another</p>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Widget grid -->
	<div class="flex-1 p-6 overflow-y-auto">
		{#if dashboardLoading}
			<div class="dash-skeleton">
				{#each {length: 4} as _}
					<div class="skel-widget"></div>
				{/each}
			</div>
		{:else if layout.length === 0}
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<p class="text-5xl mb-4">⬛</p>
				<p class="text-white text-sm font-medium mb-2">Your dashboard is empty</p>
				<p class="text-[#7c7c7c] text-xs mb-6">Add widgets to customize your workspace</p>
				<button onclick={() => showPicker = true}
					class="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
					+ Add Widgets
				</button>
			</div>
		{:else}
			<div class="widget-grid">
				{#each layout as widget (widget.id)}
					{@const def = WIDGET_REGISTRY[widget.type]}
					<div
						class="widget-card {dragOver === widget.id ? 'drag-over' : ''}"
						style="grid-column: span {widget.cols * 2}; min-height: {rowHeights[widget.rows]}px;"
						ondragover={(e) => onDragOver(e, widget.id)}
						ondragleave={() => dragOver = null}
						ondrop={(e) => onDrop(e, widget.id)}
						ondragend={() => { dragging = null; dragOver = null; }}
					>
						<!-- Drag handle -->
						<div class="widget-drag-handle" draggable="true"
							ondragstart={(e) => onDragStart(e, widget.id)}
							aria-label="Drag to reorder">⠿</div>
						<!-- Widget chrome (header + controls) -->
						<div class="widget-chrome flex items-center justify-between">
							<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;color:var(--c-text-faint)">{widgetLabel(widget.type)}</p>
							<div class="flex items-center gap-2">
								<!-- Resize popover -->
								<div class="widget-controls">
									<div class="resize-wrap" style="position:relative;">
										<button onclick={(e) => { e.stopPropagation(); resizingWidgetId = resizingWidgetId === widget.id ? null : widget.id; }}
											class="ctrl-mini resize-trigger" aria-label="Resize widget" title="Resize">⊞</button>

										{#if resizingWidgetId === widget.id}
											<div class="resize-popover">
												<div class="resize-section">
													<span class="resize-label">WIDTH</span>
													<div class="resize-options">
														{#each [{label:'1/3', val:1}, {label:'2/3', val:2}, {label:'Full', val:3}] as opt}
															<button onclick={() => { setWidgetCols(widget.id, opt.val as 1|2|3); }}
																class="resize-opt {widget.cols === opt.val ? 'active' : ''}">
																{opt.label}
															</button>
														{/each}
													</div>
												</div>
												<div class="resize-section">
													<span class="resize-label">HEIGHT</span>
													<div class="resize-options">
														{#each [{label:'S', val:'sm'}, {label:'M', val:'md'}, {label:'L', val:'lg'}, {label:'XL', val:'xl'}] as opt}
															<button onclick={() => { setWidgetRows(widget.id, opt.val as any); }}
																class="resize-opt {widget.rows === opt.val ? 'active' : ''}">
																{opt.label}
															</button>
														{/each}
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>
								<button
									onclick={() => removeWidget(widget.id)}
									class="remove-btn text-xs text-[#6e6e6e] hover:text-red-400 transition-all"
									aria-label="Remove {widgetLabel(widget.type)} widget"
									title="Remove widget"><Icon name="x" size={14} /></button>
							</div>
						</div>
						<!-- Widget content — dynamic component from registry -->
						<div class="flex-1 min-h-0 overflow-hidden">
							{#if def?.component}
								<svelte:component this={def.component} />
							{:else}
								<div class="flex items-center justify-center h-full">
									<p class="text-xs text-[#333]">Unknown: {widget.type}</p>
								</div>
							{/if}
						</div>
					</div><!-- /.widget-card -->
				{/each}
			</div><!-- /.widget-grid -->
		{/if}
	</div>
</div>

<style>
  /* ── Hero KPI band ───────────────────────────────────────────────────── */
  .hero-band {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 32px 56px;
    padding: 22px 32px 24px;
    background: var(--c-card);
    border-bottom: 1px solid var(--c-border);
  }
  .hero-primary {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 180px;
  }
  .hero-label {
    font-family: var(--font-label);
    font-size: var(--text-label);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--c-text-muted);
  }
  .hero-value {
    font-family: var(--font-display);
    font-size: var(--text-hero);
    line-height: 1;
    font-weight: 400;
    color: var(--accent);
  }
  .hero-supporting {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 20px 48px;
    padding-bottom: 4px;
  }
  .hero-stat {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 96px;
  }
  .hero-stat-label {
    font-family: var(--font-label);
    font-size: var(--text-label);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--c-text-muted);
  }
  .hero-stat-value {
    font-family: var(--font-display);
    font-size: var(--text-title);
    line-height: 1;
    color: var(--c-text-primary);
  }
  /* Loading skeletons — sized to their final glyphs so there is no layout jump */
  .hero-skel {
    border-radius: 5px;
    background: linear-gradient(90deg, #161616 0%, #202020 50%, #161616 100%);
    background-size: 200% 100%;
    animation: hero-shimmer 1.2s ease-in-out infinite;
  }
  .hero-skel-value { width: 132px; height: 48px; }
  .hero-skel-stat  { width: 72px;  height: 20px; }
  @keyframes hero-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (max-width: 640px) {
    .hero-band { flex-direction: column; align-items: flex-start; gap: 20px; padding: 18px 20px 20px; }
    .hero-supporting { gap: 18px 32px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hero-skel { animation: none; }
  }

  /* ── Configurable top band ───────────────────────────────────────────── */
  .top-band-container {
    border-bottom: 1px solid #1e1e1e;
  }
  .top-band-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid #111;
  }
  .top-band-label {
    font-size: 9px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #333;
  }
  .top-band-edit {
    font-size: 10px;
    color: #444;
    background: none;
    border: 1px solid #1e1e1e;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .top-band-edit:hover { color: #888; border-color: #333; }
  .top-band-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid #111;
    background: #080808;
  }
  .top-band-option {
    font-size: 10px;
    padding: 4px 10px;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
    color: #666;
    background: none;
    cursor: pointer;
    transition: all 0.15s;
  }
  .top-band-option.active { border-color: #0f3; color: #0f3; background: #001a08; }
  .top-band-option.disabled { opacity: 0.3; cursor: not-allowed; }
  .top-band-hint { font-size: 9px; color: #333; align-self: center; margin-left: auto; }

  .cyber-widgets-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 16px;
  }
  @media (min-width: 768px) {
    .cyber-widgets-grid { grid-template-columns: 1fr 1fr; }
  }

  /* ── Draggable widget grid ───────────────────────────────────────────── */
  .widget-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (min-width: 640px) {
    .widget-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (min-width: 1024px) {
    .widget-grid { grid-template-columns: repeat(6, 1fr); }
  }

  .widget-card {
    border-radius: 12px;
    border: 1px solid #2a2a2a;
    background: #111111;
    /* No padding here — each widget manages its own internal padding.
       Full-bleed widgets (Matrix Rain, iframes) can fill edge-to-edge.
       The chrome row (.widget-chrome) carries its own padding. */
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: border-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
    position: relative;
  }
  .widget-card.drag-over {
    border-color: #555;
    box-shadow: inset 0 0 0 2px #333;
    transform: scale(0.985);
  }

  /* Chrome row inside card — header + controls */
  .widget-chrome {
    padding: 14px 16px 10px 28px;
    flex-shrink: 0;
  }

  /* Show remove button and controls on card hover */
  .widget-card .remove-btn {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .widget-card:hover .remove-btn { opacity: 1; }

  /* Size / height controls — fade in on hover */
  .widget-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .widget-card:hover .widget-controls { opacity: 1; }

  .ctrl-mini {
    font-size: 11px;
    color: #555;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.1s, background 0.1s;
  }
  .ctrl-mini:hover { color: #ccc; background: #1a1a1a; }

  .widget-drag-handle {
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 14px;
    color: #2a2a2a;
    cursor: grab;
    opacity: 0.3;
    padding: 4px;
    border-radius: 4px;
    line-height: 1;
    transition: color 0.15s, opacity 0.15s;
    z-index: 5;
  }
  .widget-card:hover .widget-drag-handle { color: #777; opacity: 1; }
  .widget-drag-handle:active { cursor: grabbing; }
  /* On touch devices */</style>
