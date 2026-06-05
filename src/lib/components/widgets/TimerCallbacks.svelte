<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { apiFetch } from '$lib/api';

  interface CallbackSettings {
    warningMinutes: number;
    maxItems: number;
    colorTheme: string;
    autoRefresh: boolean;
    showContact: boolean;
  }

  interface CallbackTask {
    id: string;
    title: string;
    task_type: string;
    due_date: string | null;
    status: string;
    contact: { id: string; name: string; company: string | null; phone: string | null } | null;
  }

  const STORAGE_KEY = 'rogueos_callbacks_settings';

  const DEFAULTS: CallbackSettings = {
    warningMinutes: 30,
    maxItems: 5,
    colorTheme: 'amber',
    autoRefresh: true,
    showContact: true,
  };

  const THEME_COLORS: Record<string, { primary: string; glow: string; bg: string; dim: string; warn: string }> = {
    amber: { primary: '#ffb300', glow: '#ffb300', bg: '#1a1000', dim: '#5a3a00', warn: '#ff6600' },
    red:   { primary: '#ff3333', glow: '#ff3333', bg: '#1f0000', dim: '#5a0000', warn: '#ff6060' },
    cyan:  { primary: '#00e5ff', glow: '#00e5ff', bg: '#001a1f', dim: '#004a5a', warn: '#ff9900' },
    green: { primary: '#00ff88', glow: '#00ff88', bg: '#001a0d', dim: '#004a28', warn: '#ffcc00' },
  };

  const { onsettingschange }: { onsettingschange?: (s: CallbackSettings) => void } = $props();

  let settings = $state<CallbackSettings>({ ...DEFAULTS });
  let settingsOpen = $state(false);
  let draft = $state<CallbackSettings>({ ...DEFAULTS });

  let tasks = $state<CallbackTask[]>([]);
  let loading = $state(false);
  let now = $state(Date.now());

  let ticker: ReturnType<typeof setInterval> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const theme = $derived(THEME_COLORS[settings.colorTheme] ?? THEME_COLORS.amber);

  async function fetchCallbacks() {
    loading = true;
    try {
      const res = await apiFetch('/api/tasks?status=pending');
      if (res.ok) {
        const all: CallbackTask[] = await res.json();
        const nowTs = Date.now();
        const in24h = nowTs + 24 * 60 * 60 * 1000;
        tasks = all
          .filter(t => {
            if (t.task_type === 'callback') return true;
            if (t.due_date) {
              const ts = new Date(t.due_date).getTime();
              return ts <= in24h;
            }
            return false;
          })
          .sort((a, b) => {
            const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
            const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
            return da - db;
          })
          .slice(0, settings.maxItems);
      }
    } catch { /* non-fatal */ }
    loading = false;
  }

  function startRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (settings.autoRefresh) {
      refreshTimer = setInterval(fetchCallbacks, 60_000);
    }
  }

  function countdownStr(due: string | null): string {
    if (!due) return '—';
    const diff = new Date(due).getTime() - now;
    if (diff < 0) return 'OVERDUE';
    const totalSecs = Math.floor(diff / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  function isOverdue(due: string | null): boolean {
    if (!due) return false;
    return new Date(due).getTime() < now;
  }

  function isWarning(due: string | null): boolean {
    if (!due) return false;
    const diff = new Date(due).getTime() - now;
    return diff > 0 && diff < settings.warningMinutes * 60 * 1000;
  }

  function callUrl(task: CallbackTask): string | null {
    if (!task.contact?.phone) return null;
    return `/phone?number=${encodeURIComponent(task.contact.phone)}`;
  }

  function openSettings() {
    draft = { ...settings };
    settingsOpen = true;
  }

  function saveSettings() {
    settings = { ...draft };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    settingsOpen = false;
    fetchCallbacks();
    startRefresh();
    onsettingschange?.(settings);
  }

  function cancelSettings() { settingsOpen = false; }

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { settings = { ...DEFAULTS, ...JSON.parse(stored) }; } catch {}
    }
    fetchCallbacks();
    startRefresh();
    // Update "now" every second for live countdowns
    ticker = setInterval(() => { now = Date.now(); }, 1000);
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
    if (refreshTimer) clearInterval(refreshTimer);
  });
</script>

<div class="cb-wrap" style="--clr:{theme.primary};--glow:{theme.glow};--bg:{theme.bg};--dim:{theme.dim};--warn:{theme.warn};">

  <button class="gear-btn" onclick={openSettings} aria-label="Settings">⚙</button>

  <!-- Header -->
  <div class="cb-header">
    <span class="blink-dot"></span>
    <span class="cb-title" style="color:var(--clr)">CALLBACKS</span>
    {#if loading}
      <span class="loading-dot" style="color:var(--dim)">…</span>
    {:else}
      <button class="refresh-btn" onclick={fetchCallbacks} style="color:var(--dim)">↻</button>
    {/if}
  </div>

  <!-- Callback list -->
  <div class="cb-list">
    {#if tasks.length === 0 && !loading}
      <div class="empty-state" style="color:var(--dim)40;">
        NO CALLBACKS SCHEDULED
      </div>
    {:else}
      {#each tasks as task (task.id)}
        {@const overdue = isOverdue(task.due_date)}
        {@const warning = isWarning(task.due_date)}
        <div class="cb-row"
          class:cb-overdue={overdue}
          class:cb-warning={warning && !overdue}
          style="
            border-color:{overdue ? '#ff3333' : warning ? theme.warn : theme.dim};
            background:{overdue ? '#1f000044' : warning ? '#2a180044' : 'transparent'};
          ">

          <!-- Contact info -->
          {#if settings.showContact && task.contact}
            <div class="cb-contact">
              <span class="cb-name" style="color:{overdue ? '#ff5555' : warning ? theme.warn : theme.primary};">
                {task.contact.name}
              </span>
              {#if task.contact.company}
                <span class="cb-company" style="color:var(--dim);">{task.contact.company}</span>
              {/if}
            </div>
          {:else}
            <div class="cb-contact">
              <span class="cb-name" style="color:{overdue ? '#ff5555' : warning ? theme.warn : theme.primary};">
                {task.title}
              </span>
            </div>
          {/if}

          <!-- Countdown -->
          <div class="cb-countdown"
            class:overdue-pulse={overdue}
            style="color:{overdue ? '#ff3333' : warning ? theme.warn : theme.dim};">
            {countdownStr(task.due_date)}
          </div>

          <!-- Call button -->
          {#if callUrl(task)}
            <a href={callUrl(task)!} class="call-btn"
              style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 6px {theme.glow}40;">
              CALL
            </a>
          {:else}
            <div class="call-btn-placeholder"></div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Settings drawer -->
  {#if settingsOpen}
    <div class="drawer-overlay" onclick={cancelSettings}></div>
    <div class="settings-drawer">
      <div class="drawer-header">
        <span class="drawer-title">CALLBACK SETTINGS</span>
        <button class="close-btn" onclick={cancelSettings}><Icon name="x" size={14} /></button>
      </div>

      <div class="setting-group">
        <label>Warning Threshold (min) <span class="val">{draft.warningMinutes}</span></label>
        <input type="range" min="5" max="120" bind:value={draft.warningMinutes} />
      </div>
      <div class="setting-group">
        <label>Max Items <span class="val">{draft.maxItems}</span></label>
        <input type="range" min="1" max="15" bind:value={draft.maxItems} />
      </div>
      <div class="setting-group">
        <label>Color Theme</label>
        <select bind:value={draft.colorTheme}>
          <option value="amber">Amber</option>
          <option value="red">Red</option>
          <option value="cyan">Cyan</option>
          <option value="green">Green</option>
        </select>
      </div>
      <div class="setting-group toggle-row">
        <label>Auto-Refresh (60s)</label>
        <input type="checkbox" bind:checked={draft.autoRefresh} />
      </div>
      <div class="setting-group toggle-row">
        <label>Show Contact Info</label>
        <input type="checkbox" bind:checked={draft.showContact} />
      </div>

      <div class="drawer-footer">
        <button class="btn-cancel" onclick={cancelSettings}>Cancel</button>
        <button class="btn-save" onclick={saveSettings}>Save</button>
      </div>
    </div>
  {/if}
</div>

<style>

  .cb-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg);
    border: 1px solid var(--clr);
    border-radius: 8px;
    padding: 14px;
    box-shadow: 0 0 18px color-mix(in srgb, var(--glow) 20%, transparent);
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden;
    min-height: 200px;
  }

  .gear-btn {
    position: absolute; top: 8px; right: 8px;
    background: none; border: none; color: var(--dim);
    font-size: 14px; cursor: pointer; z-index: 5;
    transition: color 0.2s;
  }
  .gear-btn:hover { color: var(--clr); }

  .cb-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .blink-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--clr);
    box-shadow: 0 0 8px var(--glow);
    animation: blink 1.2s ease infinite;
    flex-shrink: 0;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .cb-title { font-size: 9px; letter-spacing: 3px; flex: 1; }
  .loading-dot { font-size: 14px; animation: blink 0.6s ease infinite; }
  .refresh-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; transition: color 0.2s;
  }
  .refresh-btn:hover { color: var(--clr) !important; }

  .cb-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  .empty-state {
    text-align: center;
    font-size: 10px;
    letter-spacing: 2px;
    padding: 20px 0;
  }

  .cb-row {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid;
    border-radius: 5px;
    padding: 6px 8px;
    transition: border-color 0.3s, background 0.3s;
  }

  .cb-overdue { animation: overdueGlow 1.2s ease infinite; }
  @keyframes overdueGlow {
    0%,100% { box-shadow: 0 0 4px #ff3333; }
    50% { box-shadow: 0 0 12px #ff3333; }
  }

  .cb-warning { animation: warnPulse 2s ease infinite; }
  @keyframes warnPulse {
    0%,100% { opacity: 1; }
    50% { opacity: 0.75; }
  }

  .cb-contact {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cb-name {
    font-size: 11px;
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cb-company {
    font-size: 9px;
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cb-countdown {
    font-size: 10px;
    letter-spacing: 1px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .overdue-pulse {
    animation: overdueText 0.8s ease infinite;
  }
  @keyframes overdueText {
    0%,100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .call-btn {
    flex-shrink: 0;
    font-size: 9px;
    letter-spacing: 2px;
    border: 1px solid;
    border-radius: 4px;
    padding: 2px 8px;
    text-decoration: none;
    transition: box-shadow 0.2s, filter 0.2s;
    white-space: nowrap;
  }
  .call-btn:hover { filter: brightness(1.3); }
  .call-btn-placeholder { width: 44px; flex-shrink: 0; }

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
  .setting-group label {
    font-size:9px; letter-spacing:1px; color:var(--dim);
    display:flex; justify-content:space-between;
  }
  .setting-group .val { color:var(--clr); }
  .setting-group input[type="range"] { width:100%; accent-color:var(--clr); }
  .setting-group select {
    background:#0d0d0d; border:1px solid var(--dim); border-radius:4px;
    color:#fff; font-size:11px; padding:4px 8px;
    font-family:'Share Tech Mono',monospace; width:100%;
  }
  .toggle-row { flex-direction:row; align-items:center; justify-content:space-between; }
  .toggle-row label { flex-direction:row; }
  .toggle-row input[type="checkbox"] { accent-color:var(--clr); width:16px; height:16px; }

  .drawer-footer { display:flex; gap:8px; margin-top:auto; padding-top:8px; }
  .btn-cancel {
    flex:1; background:none; border:1px solid #333; border-radius:4px;
    color:#555; font-family:'Share Tech Mono',monospace; font-size:10px;
    letter-spacing:1px; padding:6px; cursor:pointer;
  }
  .btn-cancel:hover { color:#fff; border-color:#666; }
  .btn-save {
    flex:1; background:var(--clr); border:none; border-radius:4px;
    color:#000; font-family:'Share Tech Mono',monospace; font-size:10px;
    letter-spacing:1px; padding:6px; cursor:pointer; font-weight:700;
    box-shadow:0 0 10px var(--glow);
  }
  .btn-save:hover { filter:brightness(1.15); }
</style>
