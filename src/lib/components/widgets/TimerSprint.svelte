<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';

  interface SprintSettings {
    durationMinutes: number;
    goalCount: number;
    goalType: string;
    customGoalLabel: string;
    colorTheme: string;
    autoReset: boolean;
  }

  const STORAGE_KEY = 'rogueos_sprint_settings';

  const DEFAULTS: SprintSettings = {
    durationMinutes: 10,
    goalCount: 10,
    goalType: 'calls',
    customGoalLabel: 'Items',
    colorTheme: 'pink',
    autoReset: false,
  };

  const THEME_COLORS: Record<string, { primary: string; glow: string; bg: string; dim: string }> = {
    pink:  { primary: '#ff2d8a', glow: '#ff2d8a', bg: '#1f0012', dim: '#5a0035' },
    cyan:  { primary: '#00e5ff', glow: '#00e5ff', bg: '#001a1f', dim: '#004a5a' },
    amber: { primary: '#ffb300', glow: '#ffb300', bg: '#1a1000', dim: '#5a3a00' },
    green: { primary: '#00ff88', glow: '#00ff88', bg: '#001a0d', dim: '#004a28' },
  };

  const GOAL_LABELS: Record<string, string> = {
    calls: 'CALLS',
    tasks: 'TASKS',
    demos: 'DEMOS',
    custom: '',
  };

  const { onsettingschange }: { onsettingschange?: (s: SprintSettings) => void } = $props();

  let settings = $state<SprintSettings>({ ...DEFAULTS });
  let settingsOpen = $state(false);
  let draft = $state<SprintSettings>({ ...DEFAULTS });

  // Timer state
  let totalSeconds = $state(10 * 60);
  let remaining = $state(10 * 60);
  let running = $state(false);
  let completed = $state(0);      // items completed
  let sprintDone = $state(false); // all goals met
  let timeUp = $state(false);
  let particles = $state(false);

  let ticker: ReturnType<typeof setInterval> | null = null;
  let startWall = $state<number | null>(null);   // wall clock when timer started
  let initialRemaining = $state(0);              // remaining seconds when ticker started

  const theme = $derived(THEME_COLORS[settings.colorTheme] ?? THEME_COLORS.pink);

  const goalLabel = $derived(
    settings.goalType === 'custom'
      ? (settings.customGoalLabel || 'ITEMS')
      : GOAL_LABELS[settings.goalType] ?? 'CALLS'
  );

  const minutesDisplay = $derived(String(Math.floor(remaining / 60)).padStart(2, '0'));
  const secondsDisplay = $derived(String(remaining % 60).padStart(2, '0'));

  // SVG ring progress (border ring): fraction of time elapsed
  const RING_R = 48;
  const RING_CIRC = 2 * Math.PI * RING_R;
  const ringElapsed = $derived(totalSeconds > 0 ? (totalSeconds - remaining) / totalSeconds : 0);
  const ringDash = $derived(RING_CIRC * ringElapsed);

  // Segment bar
  const segments = $derived(Array.from({ length: settings.goalCount }, (_, i) => i));

  function startSprint() {
    if (running) return;
    if (sprintDone || timeUp) resetSprint();
    running = true;
    startTicker();
  }

  function pauseSprint() {
    running = false;
    startWall = null;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function resetSprint() {
    pauseSprint();
    totalSeconds = settings.durationMinutes * 60;
    remaining = totalSeconds;
    completed = 0;
    sprintDone = false;
    timeUp = false;
    particles = false;
  }

  function startTicker() {
    if (ticker) clearInterval(ticker);
    startWall = Date.now();
    initialRemaining = remaining;
    ticker = setInterval(() => {
      if (!startWall) return;
      const elapsed = Math.floor((Date.now() - startWall) / 1000);
      remaining = Math.max(0, initialRemaining - elapsed);
      if (remaining <= 0) {
        remaining = 0;
        clearInterval(ticker!);
        ticker = null;
        running = false;
        if (completed < settings.goalCount) {
          timeUp = true;
          if (settings.autoReset) setTimeout(resetSprint, 3000);
        }
      }
    }, 500); // poll every 500ms for accuracy even in background tabs
  }

  function increment() {
    if (completed >= settings.goalCount) return;
    completed += 1;
    if (completed >= settings.goalCount) {
      sprintDone = true;
      particles = true;
      pauseSprint();
      if (settings.autoReset) setTimeout(resetSprint, 3000);
    }
  }

  function decrement() {
    if (completed <= 0) return;
    completed -= 1;
    sprintDone = false;
    timeUp = false;
    particles = false;
  }

  function openSettings() {
    draft = { ...settings };
    settingsOpen = true;
  }

  function saveSettings() {
    settings = { ...draft };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    settingsOpen = false;
    resetSprint();
    onsettingschange?.(settings);
  }

  function cancelSettings() { settingsOpen = false; }

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { settings = { ...DEFAULTS, ...JSON.parse(stored) }; } catch {}
    }
    totalSeconds = settings.durationMinutes * 60;
    remaining = totalSeconds;
  });

  onDestroy(() => { if (ticker) clearInterval(ticker); });
</script>

<div class="sprint-wrap" style="--clr:{theme.primary};--glow:{theme.glow};--bg:{theme.bg};--dim:{theme.dim};">

  <!-- Progress ring (SVG border) -->
  <svg class="ring-svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r={RING_R} fill="none" stroke={theme.dim} stroke-width="2" />
    <circle cx="50" cy="50" r={RING_R} fill="none"
      stroke={timeUp ? '#ff3333' : theme.primary}
      stroke-width="2"
      stroke-linecap="round"
      stroke-dasharray="{ringDash} {RING_CIRC}"
      transform="rotate(-90 50 50)"
      style="filter:drop-shadow(0 0 4px {timeUp ? '#ff3333' : theme.glow});transition:stroke-dasharray 0.9s linear;" />
  </svg>

  <!-- Gear -->
  <button class="gear-btn" onclick={openSettings} aria-label="Settings">⚙</button>

  <!-- Header -->
  <div class="sprint-header">
    <span class="blink-dot" class:running></span>
    <span class="sprint-label" style="color:var(--clr)">SPRINT TIMER</span>
  </div>

  <!-- Countdown -->
  <div class="countdown" style="color:{timeUp ? '#ff3333' : theme.primary};
    text-shadow:0 0 20px {timeUp ? '#ff3333' : theme.glow};">
    {#if sprintDone}
      <span class="flash-text" style="color:var(--clr);">SPRINT COMPLETE</span>
    {:else if timeUp}
      <span class="flash-text red">TIME UP</span>
    {:else}
      {minutesDisplay}:{secondsDisplay}
    {/if}
  </div>

  <!-- Goal counter -->
  <div class="goal-row">
    <button class="counter-btn" onclick={decrement}>−</button>
    <div class="goal-count" style="color:var(--clr);text-shadow:0 0 10px {theme.glow};">
      {completed}<span class="goal-total">/{settings.goalCount}</span>
    </div>
    <button class="counter-btn" onclick={increment}>+</button>
  </div>
  <div class="goal-type-label" style="color:var(--dim);">{goalLabel}</div>

  <!-- Segment bar -->
  <div class="seg-bar">
    {#each segments as i}
      <div class="seg"
        class:seg-filled={i < completed}
        style="--clr:{theme.primary};--glow:{theme.glow};"
      ></div>
    {/each}
  </div>

  <!-- Controls -->
  <div class="ctrl-row">
    <button class="reset-btn" onclick={resetSprint}>↺</button>
    {#if running}
      <button class="main-btn pause" onclick={pauseSprint}
        style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 16px {theme.glow}40;">
        ⏸ PAUSE
      </button>
    {:else}
      <button class="main-btn start" onclick={startSprint}
        style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 16px {theme.glow}40;">
        ▶ START
      </button>
    {/if}
  </div>

  <!-- Confetti particles (CSS only) -->
  {#if particles}
    <div class="confetti-wrap" aria-hidden="true">
      {#each {length: 18} as _, i}
        <div class="particle" style="
          --px:{(i * 37 + 11) % 100}%;
          --py:{(i * 53 + 7) % 80}%;
          --delay:{(i * 0.07).toFixed(2)}s;
          --hue:{(i * 20) % 360}deg;
          animation-delay:var(--delay);
        "></div>
      {/each}
    </div>
  {/if}

  <!-- Settings drawer -->
  {#if settingsOpen}
    <div class="drawer-overlay" onclick={cancelSettings}></div>
    <div class="settings-drawer">
      <div class="drawer-header">
        <span class="drawer-title">SPRINT SETTINGS</span>
        <button class="close-btn" onclick={cancelSettings}><Icon name="x" size={14} /></button>
      </div>

      <div class="setting-group">
        <label>Duration (min) <span class="val">{draft.durationMinutes}</span></label>
        <input type="range" min="5" max="60" bind:value={draft.durationMinutes} />
      </div>
      <div class="setting-group">
        <label>Goal Count <span class="val">{draft.goalCount}</span></label>
        <input type="range" min="1" max="50" bind:value={draft.goalCount} />
      </div>
      <div class="setting-group">
        <label>Goal Type</label>
        <select bind:value={draft.goalType}>
          <option value="calls">Calls</option>
          <option value="tasks">Tasks</option>
          <option value="demos">Demos</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      {#if draft.goalType === 'custom'}
        <div class="setting-group">
          <label>Custom Label</label>
          <input type="text" bind:value={draft.customGoalLabel} maxlength="20" />
        </div>
      {/if}
      <div class="setting-group">
        <label>Color Theme</label>
        <select bind:value={draft.colorTheme}>
          <option value="pink">Pink</option>
          <option value="cyan">Cyan</option>
          <option value="amber">Amber</option>
          <option value="green">Green</option>
        </select>
      </div>
      <div class="setting-group toggle-row">
        <label>Auto-Reset on Complete</label>
        <input type="checkbox" bind:checked={draft.autoReset} />
      </div>

      <div class="drawer-footer">
        <button class="btn-cancel" onclick={cancelSettings}>Cancel</button>
        <button class="btn-save" onclick={saveSettings}>Save</button>
      </div>
    </div>
  {/if}
</div>

<style>

  .sprint-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    background: var(--bg);
    border: 1px solid var(--clr);
    border-radius: 8px;
    padding: 18px 14px 14px;
    box-shadow: 0 0 18px color-mix(in srgb, var(--glow) 20%, transparent);
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden;
    min-height: 320px;
  }

  /* SVG ring positioned as border overlay */
  .ring-svg {
    position: absolute;
    inset: -4px;
    width: calc(100% + 8px);
    height: calc(100% + 8px);
    pointer-events: none;
    z-index: 1;
  }

  .gear-btn {
    position: absolute;
    top: 8px; right: 8px;
    background: none; border: none;
    color: var(--dim); font-size: 14px;
    cursor: pointer; z-index: 5;
    transition: color 0.2s;
  }
  .gear-btn:hover { color: var(--clr); }

  .sprint-header {
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 2;
  }
  .blink-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--dim);
    transition: background 0.3s, box-shadow 0.3s;
  }
  .blink-dot.running {
    background: var(--clr);
    box-shadow: 0 0 8px var(--glow);
    animation: blink 1s ease infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .sprint-label {
    font-size: 9px;
    letter-spacing: 3px;
  }

  .countdown {
    font-family: 'Orbitron', 'Share Tech Mono', monospace;
    font-size: 42px;
    font-weight: 700;
    letter-spacing: 4px;
    line-height: 1;
    z-index: 2;
    transition: color 0.3s;
  }

  .flash-text {
    font-size: 18px;
    letter-spacing: 2px;
    animation: flashText 0.6s ease infinite;
  }
  .flash-text.red { color: #ff3333 !important; }
  @keyframes flashText { 0%,100%{opacity:1} 50%{opacity:0.4} }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 14px;
    z-index: 2;
  }
  .goal-count {
    font-family: 'Orbitron', monospace;
    font-size: 28px;
    font-weight: 700;
  }
  .goal-total {
    font-size: 16px;
    opacity: 0.5;
  }
  .counter-btn {
    background: none;
    border: 1px solid var(--dim);
    border-radius: 6px;
    color: var(--clr);
    font-size: 20px;
    width: 34px; height: 34px;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .counter-btn:hover {
    border-color: var(--clr);
    box-shadow: 0 0 8px var(--glow);
  }

  .goal-type-label {
    font-size: 9px;
    letter-spacing: 3px;
    margin-top: -4px;
    z-index: 2;
  }

  .seg-bar {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 100%;
    z-index: 2;
  }
  .seg {
    height: 8px;
    flex: 1;
    min-width: 6px;
    max-width: 18px;
    border-radius: 2px;
    background: var(--dim);
    transition: background 0.2s, box-shadow 0.2s;
  }
  .seg-filled {
    background: var(--clr);
    box-shadow: 0 0 6px var(--glow);
  }

  .ctrl-row {
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 2;
  }
  .reset-btn {
    background: none;
    border: none;
    color: var(--dim);
    font-size: 18px;
    cursor: pointer;
    transition: color 0.2s;
  }
  .reset-btn:hover { color: var(--clr); }
  .main-btn {
    border: 1px solid;
    border-radius: 6px;
    background: none;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    letter-spacing: 2px;
    padding: 7px 24px;
    cursor: pointer;
    transition: box-shadow 0.2s;
  }

  /* Confetti */
  .confetti-wrap {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 3;
  }
  .particle {
    position: absolute;
    width: 6px; height: 6px;
    border-radius: 50%;
    left: var(--px);
    top: var(--py);
    background: hsl(var(--hue) 90% 60%);
    animation: burstUp 1.2s ease-out forwards;
  }
  @keyframes burstUp {
    0%   { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-80px) scale(0.3); opacity: 0; }
  }

  /* Settings drawer */
  .drawer-overlay {
    position: absolute; inset: 0; z-index: 8; background: transparent;
  }
  .settings-drawer {
    position: absolute; inset: 0; z-index: 10;
    background: color-mix(in srgb, var(--bg) 97%, black);
    border-left: 1px solid var(--clr);
    padding: 14px;
    display: flex; flex-direction: column; gap: 10px;
    animation: slideIn 0.2s ease;
    overflow-y: auto;
  }
  @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }

  .drawer-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;
  }
  .drawer-title { font-size: 9px; letter-spacing: 3px; color: var(--clr); }
  .close-btn { background:none; border:none; color:var(--dim); cursor:pointer; font-size:14px; }
  .close-btn:hover { color:var(--clr); }

  .setting-group { display:flex; flex-direction:column; gap:4px; }
  .setting-group label {
    font-size:9px; letter-spacing:1px; color:var(--dim);
    display:flex; justify-content:space-between;
  }
  .setting-group .val { color:var(--clr); }
  .setting-group input[type="range"] { width:100%; accent-color:var(--clr); }
  .setting-group input[type="text"],
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
