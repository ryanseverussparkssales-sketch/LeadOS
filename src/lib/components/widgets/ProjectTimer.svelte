<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';

  interface ProjectTimerSettings {
    defaultProjectId: string;
    colorTheme: string;
    showWeeklyTotal: boolean;
    autoNote: boolean;
  }

  interface TimeEntry {
    id: string;
    project_id: string | null;
    project?: { name: string } | null;
    duration_minutes: number;
    description: string | null;
    created_at: string;
  }

  const STORAGE_KEY = 'leados_project_timer_settings';
  const STATE_KEY   = 'leados_project_timer_state';

  const DEFAULTS: ProjectTimerSettings = {
    defaultProjectId: '',
    colorTheme: 'green',
    showWeeklyTotal: true,
    autoNote: false,
  };

  const THEME_COLORS: Record<string, { primary: string; glow: string; bg: string; dim: string; stop: string }> = {
    green: { primary: '#00ff88', glow: '#00ff88', bg: '#001a0d', dim: '#004a28', stop: '#ff3333' },
    cyan:  { primary: '#00e5ff', glow: '#00e5ff', bg: '#001a1f', dim: '#004a5a', stop: '#ff3333' },
    amber: { primary: '#ffb300', glow: '#ffb300', bg: '#1a1000', dim: '#5a3a00', stop: '#ff3333' },
    pink:  { primary: '#ff2d8a', glow: '#ff2d8a', bg: '#1f0012', dim: '#5a0035', stop: '#ff3333' },
  };

  interface TimerPersist {
    running: boolean;
    startedAt: number | null;
    pausedMs: number;
    projectId: string;
    campaignId: string;
  }

  const { onsettingschange }: { onsettingschange?: (s: ProjectTimerSettings) => void } = $props();

  let settings = $state<ProjectTimerSettings>({ ...DEFAULTS });
  let settingsOpen = $state(false);
  let draft = $state<ProjectTimerSettings>({ ...DEFAULTS });

  // Selections
  let projects = $state<{ id: string; name: string }[]>([]);
  let campaigns = $state<{ id: string; name: string; project_id: string }[]>([]);
  let selectedProjectId = $state('');
  let selectedCampaignId = $state('');

  // Timer
  let running = $state(false);
  let startedAt = $state<number | null>(null);
  let pausedMs = $state(0);
  let elapsed = $state(0); // ms

  // Description modal (autoNote)
  let showNoteModal = $state(false);
  let noteText = $state('');
  let saving = $state(false);
  let saved = $state(false);

  // Time entries
  let recentEntries = $state<TimeEntry[]>([]);
  let todayMs = $state(0);
  let weekMs = $state(0);

  let ticker: ReturnType<typeof setInterval> | null = null;

  const theme = $derived(THEME_COLORS[settings.colorTheme] ?? THEME_COLORS.green);

  const filteredCampaigns = $derived(
    selectedProjectId
      ? campaigns.filter(c => c.project_id === selectedProjectId)
      : campaigns
  );

  function computeElapsed(): number {
    const currentRun = startedAt ? Date.now() - startedAt : 0;
    return pausedMs + currentRun;
  }

  function fmtHMS(ms: number): string {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function fmtHM(ms: number): string {
    const totalMins = Math.floor(ms / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function fmtAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    return `${h}h ago`;
  }

  function saveTimerState() {
    const s: TimerPersist = { running, startedAt, pausedMs, projectId: selectedProjectId, campaignId: selectedCampaignId };
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  }

  function startTicker() {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(() => { elapsed = computeElapsed(); }, 1000);
  }

  function start() {
    if (running) return;
    running = true;
    startedAt = Date.now();
    elapsed = computeElapsed();
    saveTimerState();
    startTicker();
  }

  function pause() {
    if (!running) return;
    running = false;
    pausedMs = computeElapsed();
    startedAt = null;
    elapsed = pausedMs;
    if (ticker) { clearInterval(ticker); ticker = null; }
    saveTimerState();
  }

  async function stop() {
    pause();
    if (settings.autoNote) {
      noteText = '';
      showNoteModal = true;
      return;
    }
    await logEntry('');
  }

  async function confirmNote() {
    showNoteModal = false;
    await logEntry(noteText);
  }

  function cancelNote() {
    showNoteModal = false;
    // Don't log — leave timer paused
  }

  async function logEntry(description: string) {
    const durationMinutes = Math.max(1, Math.round(pausedMs / 60000));
    saving = true;
    try {
      await apiFetch('/api/time-entries', {
        method: 'POST',
        body: JSON.stringify({
          projectId: selectedProjectId || undefined,
          campaignId: selectedCampaignId || undefined,
          description: description || 'Timer session',
          durationMinutes,
          billable: true,
        }),
      });
      saved = true;
      setTimeout(() => { saved = false; }, 2000);
    } catch { /* non-fatal */ }
    saving = false;

    // Reset
    running = false;
    startedAt = null;
    pausedMs = 0;
    elapsed = 0;
    if (ticker) { clearInterval(ticker); ticker = null; }
    saveTimerState();
    await loadEntries();
  }

  async function loadEntries() {
    try {
      const res = await apiFetch('/api/time-entries?limit=20');
      if (!res.ok) return;
      const all: TimeEntry[] = await res.json();
      recentEntries = all.slice(0, 5);

      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      todayMs = all
        .filter(e => e.created_at?.slice(0, 10) === today &&
          (!selectedProjectId || e.project_id === selectedProjectId))
        .reduce((acc, e) => acc + (e.duration_minutes ?? 0) * 60000, 0);
      weekMs = all
        .filter(e => e.created_at >= weekAgo &&
          (!selectedProjectId || e.project_id === selectedProjectId))
        .reduce((acc, e) => acc + (e.duration_minutes ?? 0) * 60000, 0);
    } catch { /* non-fatal */ }
  }

  function openSettings() {
    draft = { ...settings };
    settingsOpen = true;
  }

  function saveSettings() {
    settings = { ...draft };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    if (settings.defaultProjectId && !selectedProjectId) {
      selectedProjectId = settings.defaultProjectId;
    }
    settingsOpen = false;
    onsettingschange?.(settings);
  }

  function cancelSettings() { settingsOpen = false; }

  onMount(async () => {
    // Load settings
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { settings = { ...DEFAULTS, ...JSON.parse(stored) }; } catch {}
    }

    // Restore timer state
    const stateStr = localStorage.getItem(STATE_KEY);
    if (stateStr) {
      try {
        const s: TimerPersist = JSON.parse(stateStr);
        running = s.running;
        startedAt = s.startedAt;
        pausedMs = s.pausedMs;
        selectedProjectId = s.projectId || settings.defaultProjectId;
        selectedCampaignId = s.campaignId || '';
        elapsed = computeElapsed();

        // Sanity check: if elapsed > 4 hours, the timer is stale — reset it
        const MAX_SESSION_MS = 4 * 60 * 60 * 1000;
        if (elapsed > MAX_SESSION_MS) {
          running = false;
          startedAt = null;
          pausedMs = 0;
          elapsed = 0;
          saveTimerState();
        } else if (running) {
          startTicker();
        }
      } catch {}
    } else {
      selectedProjectId = settings.defaultProjectId;
    }

    // Load data
    try {
      const [pr, camr] = await Promise.all([apiFetch('/api/projects'), apiFetch('/api/campaigns')]);
      projects  = pr.ok ? await pr.json() : [];
      campaigns = camr.ok ? await camr.json() : [];
    } catch {
      projects = []; campaigns = [];
    }

    await loadEntries();
  });

  onDestroy(() => { if (ticker) clearInterval(ticker); });
</script>

<div class="pt-wrap" style="--clr:{theme.primary};--glow:{theme.glow};--bg:{theme.bg};--dim:{theme.dim};--stop:{theme.stop};"
  class:active={running}>

  <button class="gear-btn" onclick={openSettings} aria-label="Settings">⚙</button>

  <!-- Header -->
  <div class="pt-header">
    <span class="blink-dot" class:running></span>
    <span class="pt-title" style="color:var(--clr)">PROJECT TIMER</span>
    {#if saved}
      <span class="saved-badge">✓ LOGGED</span>
    {/if}
  </div>

  <!-- Selectors -->
  {#if !running}
    <div class="selectors">
      <select bind:value={selectedProjectId} onchange={() => { selectedCampaignId = ''; loadEntries(); }}
        class="sel">
        <option value="">— No project —</option>
        {#each projects as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
      {#if filteredCampaigns.length > 0}
        <select bind:value={selectedCampaignId} class="sel">
          <option value="">— No campaign —</option>
          {#each filteredCampaigns as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      {/if}
    </div>
  {:else}
    <div class="running-ctx" style="color:var(--dim);">
      {#if selectedProjectId}
        <span>{projects.find(p => p.id === selectedProjectId)?.name ?? ''}</span>
      {/if}
    </div>
  {/if}

  <!-- Big timer display -->
  <div class="timer-display"
    style="color:var(--clr);text-shadow:0 0 24px {theme.glow},{running ? `0 0 40px ${theme.glow}40` : 'none'};">
    {fmtHMS(elapsed)}
  </div>

  <!-- Today / Week totals -->
  <div class="totals-row">
    <div class="total-item">
      <span class="total-label" style="color:var(--dim)">TODAY</span>
      <span class="total-val" style="color:var(--clr)">{fmtHM(todayMs + (running ? elapsed : 0))}</span>
    </div>
    {#if settings.showWeeklyTotal}
      <div class="total-divider" style="color:var(--dim)">|</div>
      <div class="total-item">
        <span class="total-label" style="color:var(--dim)">WEEK</span>
        <span class="total-val" style="color:var(--clr)">{fmtHM(weekMs)}</span>
      </div>
    {/if}
  </div>

  <!-- Controls -->
  <div class="ctrl-row">
    {#if saved}
      <div class="full-btn" style="background:{theme.dim};color:#fff;border:none;">✓ LOGGED</div>
    {:else if running}
      <button class="full-btn stop" onclick={stop} disabled={saving}
        style="border-color:var(--stop);color:var(--stop);box-shadow:0 0 18px #ff333340;">
        {saving ? 'SAVING…' : '⏹ STOP & LOG'}
      </button>
    {:else if elapsed > 0}
      <button class="full-btn start" onclick={start}
        style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 16px {theme.glow}40;">
        ▶ RESUME
      </button>
      <button class="full-btn stop" onclick={stop} disabled={saving}
        style="border-color:var(--stop);color:var(--stop);box-shadow:0 0 12px #ff333330;">
        {saving ? 'SAVING…' : 'LOG & RESET'}
      </button>
    {:else}
      <button class="full-btn start" onclick={start}
        style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 16px {theme.glow}40;">
        ▶ START
      </button>
    {/if}
  </div>

  <!-- Recent entries -->
  {#if recentEntries.length > 0}
    <div class="recent-header" style="color:var(--dim)">RECENT</div>
    <div class="recent-list">
      {#each recentEntries as entry (entry.id)}
        <div class="recent-row">
          <span class="recent-proj" style="color:var(--dim)">
            {entry.project?.name ?? '—'}
          </span>
          <span class="recent-dur" style="color:var(--clr)">
            {fmtHM((entry.duration_minutes ?? 0) * 60000)}
          </span>
          <span class="recent-ago" style="color:var(--dim)40;">
            {fmtAgo(entry.created_at)}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- autoNote modal -->
  {#if showNoteModal}
    <div class="modal-overlay">
      <div class="modal" style="border-color:var(--clr);">
        <div class="modal-title" style="color:var(--clr)">LOG DESCRIPTION</div>
        <input type="text" bind:value={noteText}
          placeholder="What did you work on?"
          class="note-input"
          style="border-color:var(--dim);color:#fff;" />
        <div class="modal-footer">
          <button class="btn-cancel" onclick={cancelNote}>Cancel</button>
          <button class="btn-save" onclick={confirmNote}
            style="background:var(--clr);box-shadow:0 0 10px {theme.glow};">
            LOG
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Settings drawer -->
  {#if settingsOpen}
    <div class="drawer-overlay" onclick={cancelSettings}></div>
    <div class="settings-drawer">
      <div class="drawer-header">
        <span class="drawer-title">TIMER SETTINGS</span>
        <button class="close-btn" onclick={cancelSettings}>✕</button>
      </div>

      <div class="setting-group">
        <label>Default Project</label>
        <select bind:value={draft.defaultProjectId}>
          <option value="">None</option>
          {#each projects as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </div>
      <div class="setting-group">
        <label>Color Theme</label>
        <select bind:value={draft.colorTheme}>
          <option value="green">Green</option>
          <option value="cyan">Cyan</option>
          <option value="amber">Amber</option>
          <option value="pink">Pink</option>
        </select>
      </div>
      <div class="setting-group toggle-row">
        <label>Show Weekly Total</label>
        <input type="checkbox" bind:checked={draft.showWeeklyTotal} />
      </div>
      <div class="setting-group toggle-row">
        <label>Prompt for Note on Stop</label>
        <input type="checkbox" bind:checked={draft.autoNote} />
      </div>

      <div class="drawer-footer">
        <button class="btn-cancel" onclick={cancelSettings}>Cancel</button>
        <button class="btn-save-drawer" onclick={saveSettings}>Save</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .pt-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bg);
    border: 1px solid var(--clr);
    border-radius: 8px;
    padding: 14px;
    box-shadow: 0 0 18px color-mix(in srgb, var(--glow) 20%, transparent);
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden;
    transition: box-shadow 0.4s;
  }

  .pt-wrap.active {
    animation: activePulse 2.5s ease infinite;
  }
  @keyframes activePulse {
    0%,100% { box-shadow: 0 0 18px color-mix(in srgb, var(--glow) 20%, transparent); }
    50% { box-shadow: 0 0 32px color-mix(in srgb, var(--glow) 40%, transparent); }
  }

  .gear-btn {
    position: absolute; top: 8px; right: 8px;
    background: none; border: none; color: var(--dim);
    font-size: 14px; cursor: pointer; z-index: 5;
    transition: color 0.2s;
  }
  .gear-btn:hover { color: var(--clr); }

  .pt-header {
    display: flex; align-items: center; gap: 6px;
  }
  .blink-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--dim);
    transition: background 0.3s, box-shadow 0.3s;
    flex-shrink: 0;
  }
  .blink-dot.running {
    background: var(--clr);
    box-shadow: 0 0 8px var(--glow);
    animation: blink 1s ease infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .pt-title { font-size: 9px; letter-spacing: 3px; flex: 1; }
  .saved-badge {
    font-size: 9px; letter-spacing: 2px;
    color: #00ff88;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }

  .selectors { display: flex; flex-direction: column; gap: 6px; }
  .sel {
    width: 100%;
    background: #0d0d0d;
    border: 1px solid var(--dim);
    border-radius: 4px;
    color: #ccc;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    padding: 5px 8px;
  }

  .running-ctx {
    font-size: 11px;
    letter-spacing: 1px;
    text-align: center;
    opacity: 0.7;
  }

  .timer-display {
    font-family: 'Orbitron', 'Share Tech Mono', monospace;
    font-size: 36px;
    font-weight: 700;
    letter-spacing: 4px;
    text-align: center;
    transition: text-shadow 0.5s;
  }

  .totals-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
  }
  .total-item { display: flex; align-items: center; gap: 6px; }
  .total-label { font-size: 9px; letter-spacing: 2px; }
  .total-val { font-size: 13px; letter-spacing: 1px; }
  .total-divider { font-size: 12px; opacity: 0.3; }

  .ctrl-row {
    display: flex;
    gap: 8px;
  }
  .full-btn {
    flex: 1;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    letter-spacing: 2px;
    padding: 9px 12px;
    cursor: pointer;
    transition: box-shadow 0.2s, filter 0.2s;
  }
  .full-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .full-btn:not(:disabled):hover { filter: brightness(1.2); }

  .recent-header {
    font-size: 8px;
    letter-spacing: 3px;
    margin-bottom: -4px;
  }
  .recent-list { display: flex; flex-direction: column; gap: 4px; }
  .recent-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    border-bottom: 1px solid;
    border-color: var(--dim);
    border-opacity: 0.3;
    padding-bottom: 3px;
  }
  .recent-proj { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recent-dur { white-space: nowrap; }
  .recent-ago { white-space: nowrap; font-size: 9px; }

  /* autoNote modal */
  .modal-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 20;
  }
  .modal {
    background: #0d0d0d;
    border: 1px solid;
    border-radius: 8px;
    padding: 18px;
    width: 85%;
    display: flex; flex-direction: column; gap: 12px;
  }
  .modal-title { font-size: 10px; letter-spacing: 2px; }
  .note-input {
    background: #000;
    border: 1px solid;
    border-radius: 4px;
    color: #fff;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    padding: 8px;
    width: 100%;
  }
  .modal-footer { display: flex; gap: 8px; }

  /* Settings drawer */
  .drawer-overlay { position:absolute; inset:0; z-index:8; background:transparent; }
  .settings-drawer {
    position:absolute; inset:0; z-index:10;
    background:color-mix(in srgb, var(--bg) 97%, black);
    border-left:1px solid var(--clr);
    padding:14px; display:flex; flex-direction:column; gap:10px;
    animation:slideIn 0.2s ease; overflow-y:auto;
  }
  @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }

  .drawer-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
  .drawer-title { font-size:9px; letter-spacing:3px; color:var(--clr); }
  .close-btn { background:none; border:none; color:var(--dim); cursor:pointer; font-size:14px; }
  .close-btn:hover { color:var(--clr); }

  .setting-group { display:flex; flex-direction:column; gap:4px; }
  .setting-group label { font-size:9px; letter-spacing:1px; color:var(--dim); }
  .setting-group select {
    background:#0d0d0d; border:1px solid var(--dim); border-radius:4px;
    color:#fff; font-size:11px; padding:4px 8px;
    font-family:'Share Tech Mono',monospace; width:100%;
  }
  .toggle-row { flex-direction:row; align-items:center; justify-content:space-between; }
  .toggle-row input[type="checkbox"] { accent-color:var(--clr); width:16px; height:16px; }

  .drawer-footer { display:flex; gap:8px; margin-top:auto; padding-top:8px; }
  .btn-cancel {
    flex:1; background:none; border:1px solid #333; border-radius:4px;
    color:#555; font-family:'Share Tech Mono',monospace; font-size:10px;
    letter-spacing:1px; padding:6px; cursor:pointer;
  }
  .btn-cancel:hover { color:#fff; border-color:#666; }
  .btn-save {
    flex:1; border:none; border-radius:4px;
    color:#000; font-family:'Share Tech Mono',monospace; font-size:10px;
    letter-spacing:1px; padding:6px; cursor:pointer; font-weight:700;
  }
  .btn-save:hover { filter:brightness(1.15); }
  .btn-save-drawer {
    flex:1; background:var(--clr); border:none; border-radius:4px;
    color:#000; font-family:'Share Tech Mono',monospace; font-size:10px;
    letter-spacing:1px; padding:6px; cursor:pointer; font-weight:700;
    box-shadow:0 0 10px var(--glow);
  }
  .btn-save-drawer:hover { filter:brightness(1.15); }
</style>
