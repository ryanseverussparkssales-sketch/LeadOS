<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';

  interface PomodoroSettings {
    focusMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    sessionsBeforeLong: number;
    colorTheme: string;
    autoStart: boolean;
    label: string;
    tickSound: boolean;
  }

  const STORAGE_KEY = 'rogueos_pomodoro_settings';

  const DEFAULTS: PomodoroSettings = {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLong: 4,
    colorTheme: 'cyan',
    autoStart: false,
    label: 'FOCUS',
    tickSound: false,
  };

  const THEME_COLORS: Record<string, { primary: string; glow: string; rgb: string; bg: string; dim: string }> = {
    cyan:  { primary: '#00e5ff', glow: '#00e5ff', rgb: '0,229,255',   bg: '#001a1f', dim: '#004a5a' },
    green: { primary: '#00ff88', glow: '#00ff88', rgb: '0,255,136',   bg: '#001a0d', dim: '#004a28' },
    pink:  { primary: '#ff2d8a', glow: '#ff2d8a', rgb: '255,45,138',  bg: '#1f0012', dim: '#5a0035' },
    amber: { primary: '#ffb300', glow: '#ffb300', rgb: '255,179,0',   bg: '#1a1000', dim: '#5a3a00' },
  };

  type Mode = 'focus' | 'short' | 'long';

  const { onsettingschange }: { onsettingschange?: (s: PomodoroSettings) => void } = $props();

  // ─── settings state ────────────────────────────────────────────────────────
  let settings = $state<PomodoroSettings>({ ...DEFAULTS });
  let settingsOpen = $state(false);
  let draft = $state<PomodoroSettings>({ ...DEFAULTS });

  // ─── timer state ───────────────────────────────────────────────────────────
  let mode = $state<Mode>('focus');
  let sessionCount = $state(0);        // completed focus sessions
  let totalSeconds = $state(25 * 60);  // total duration for current mode
  let remaining = $state(25 * 60);     // seconds left
  let running = $state(false);
  let flashing = $state(false);
  let showComplete = $state(false);

  let ticker: ReturnType<typeof setInterval> | null = null;
  let audioCtx: AudioContext | null = null;

  // ─── derived ───────────────────────────────────────────────────────────────
  const theme = $derived(THEME_COLORS[settings.colorTheme] ?? THEME_COLORS.cyan);

  const modeDurations: Record<Mode, () => number> = {
    focus: () => settings.focusMinutes * 60,
    short: () => settings.shortBreakMinutes * 60,
    long:  () => settings.longBreakMinutes * 60,
  };

  const MODE_LABELS: Record<Mode, string> = {
    focus: 'FOCUS',
    short: 'SHORT BREAK',
    long:  'LONG BREAK',
  };

  const MODE_COLORS: Record<Mode, string> = {
    focus: 'cyan',
    short: 'green',
    long:  'amber',
  };

  // Next mode logic
  const nextMode = $derived<Mode>((() => {
    if (mode === 'focus') {
      const nextSession = sessionCount + 1;
      return nextSession % settings.sessionsBeforeLong === 0 ? 'long' : 'short';
    }
    return 'focus';
  })());

  const nextModeLabel = $derived(MODE_LABELS[nextMode]);

  // SVG arc: radius 44, circumference ~276.46
  const RADIUS = 44;
  const CIRC = 2 * Math.PI * RADIUS;
  const arcOffset = $derived(CIRC * (remaining / totalSeconds));

  const minutesDisplay = $derived(String(Math.floor(remaining / 60)).padStart(2, '0'));
  const secondsDisplay = $derived(String(remaining % 60).padStart(2, '0'));

  // Session dots
  const dots = $derived(Array.from({ length: settings.sessionsBeforeLong }, (_, i) => i));

  function tick() {
    if (settings.tickSound && audioCtx) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    }
  }

  // Wall-clock correction: captures start time and computes elapsed from real time.
  // Prevents drift when tab is backgrounded (browser throttles setInterval).
  let _startWall = 0;
  let _initialRemaining = 0;

  function startTicker() {
    if (ticker) clearInterval(ticker);
    _startWall = Date.now();
    _initialRemaining = remaining;
    ticker = setInterval(() => {
      tick();
      const elapsed = Math.floor((Date.now() - _startWall) / 1000);
      remaining = Math.max(0, _initialRemaining - elapsed);
      if (remaining <= 0) {
        remaining = 0;
        clearInterval(ticker!);
        ticker = null;
        running = false;
        onTimerEnd();
      }
    }, 500); // 500ms for accuracy under throttling
  }

  function onTimerEnd() {
    if (mode === 'focus') sessionCount += 1;
    flashing = true;
    showComplete = true;
    setTimeout(() => { flashing = false; }, 1200);
    setTimeout(() => {
      showComplete = false;
      if (settings.autoStart) advanceMode();
    }, 2000);
  }

  function advanceMode() {
    const next = nextMode;
    setMode(next);
    if (settings.autoStart) startTimer();
  }

  function setMode(m: Mode) {
    mode = m;
    totalSeconds = modeDurations[m]();
    remaining = totalSeconds;
    running = false;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function startTimer() {
    if (running) return;
    running = true;
    if (settings.tickSound && !audioCtx) {
      audioCtx = new AudioContext();
    }
    startTicker();
  }

  function pauseTimer() {
    if (!running) return;
    running = false;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function resetTimer() {
    pauseTimer();
    totalSeconds = modeDurations[mode]();
    remaining = totalSeconds;
  }

  function nextModeManual() {
    pauseTimer();
    advanceMode();
  }

  // ─── keyboard shortcuts ────────────────────────────────────────────────────
  function handleKey(e: KeyboardEvent) {
    if (settingsOpen) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space') { e.preventDefault(); running ? pauseTimer() : startTimer(); }
    if (e.code === 'KeyR') resetTimer();
    if (e.code === 'KeyN') nextModeManual();
  }

  // ─── settings ──────────────────────────────────────────────────────────────
  function openSettings() {
    draft = { ...settings };
    settingsOpen = true;
  }

  function saveSettings() {
    settings = { ...draft };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    settingsOpen = false;
    // Update current timer duration
    totalSeconds = modeDurations[mode]();
    if (remaining > totalSeconds) remaining = totalSeconds;
    onsettingschange?.(settings);
  }

  function cancelSettings() {
    settingsOpen = false;
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { settings = { ...DEFAULTS, ...JSON.parse(stored) }; } catch {}
    }
    totalSeconds = modeDurations[mode]();
    remaining = totalSeconds;
    // Note: keydown is handled via onkeydown on the root div (component-scoped)
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
    audioCtx?.close();
  });
</script>

<div class="pomodoro-wrap" tabindex="-1" onkeydown={handleKey} style="--clr:{theme.primary};--glow:{theme.glow};--bg:{theme.bg};--dim:{theme.dim};">

  <!-- Gear button -->
  <button class="gear-btn" onclick={openSettings} aria-label="Settings">⚙</button>

  <!-- Mode pill -->
  <div class="mode-pill" style="border-color: var(--clr); color: var(--clr);">
    {MODE_LABELS[mode]}
  </div>

  <!-- SVG orbital ring -->
  <div class="svg-wrap" class:flash={flashing}>
    <svg viewBox="0 0 100 100" width="160" height="160">
      <!-- Track -->
      <circle cx="50" cy="50" r={RADIUS} fill="none"
        stroke={theme.dim} stroke-width="5" />
      <!-- Progress arc (depletes clockwise: stroke-dasharray shrinks) -->
      <circle cx="50" cy="50" r={RADIUS} fill="none"
        stroke={theme.primary} stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray="{arcOffset} {CIRC}"
        transform="rotate(-90 50 50)"
        style="filter:drop-shadow(0 0 6px {theme.glow}); transition: stroke-dasharray 0.8s linear;" />
      <!-- Center label -->
      {#if showComplete}
        <text x="50" y="46" text-anchor="middle"
          style="font-family:'Share Tech Mono',monospace;font-size:8px;fill:{theme.primary};letter-spacing:1px;">COMPLETE</text>
      {:else}
        <text x="50" y="44" text-anchor="middle"
          style="font-family:'Share Tech Mono',monospace;font-size:7px;fill:{theme.dim};letter-spacing:2px;">{settings.label}</text>
        <text x="50" y="56" text-anchor="middle"
          style="font-family:'Orbitron','Share Tech Mono',monospace;font-size:16px;fill:{theme.primary};font-weight:700;filter:drop-shadow(0 0 4px {theme.glow});">
          {minutesDisplay}:{secondsDisplay}
        </text>
      {/if}
    </svg>
  </div>

  <!-- Session dots -->
  <div class="dots-row">
    {#each dots as i}
      <div class="dot"
        class:dot-done={i < (sessionCount % settings.sessionsBeforeLong)}
        class:dot-current={i === (sessionCount % settings.sessionsBeforeLong) && mode === 'focus'}
        style="--clr:{theme.primary};">
      </div>
    {/each}
  </div>

  <!-- Next indicator -->
  <div class="next-label" style="color:{theme.dim};">NEXT: {nextModeLabel}</div>

  <!-- Controls -->
  <div class="ctrl-row">
    <button class="ctrl-btn reset" onclick={resetTimer} title="Reset (R)">↺</button>
    {#if running}
      <button class="ctrl-btn main" onclick={pauseTimer}
        style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 14px {theme.glow}40;">
        ⏸ PAUSE
      </button>
    {:else}
      <button class="ctrl-btn main" onclick={startTimer}
        style="border-color:var(--clr);color:var(--clr);box-shadow:0 0 14px {theme.glow}40;">
        ▶ START
      </button>
    {/if}
    <button class="ctrl-btn skip" onclick={nextModeManual} title="Next mode (N)">⏭</button>
  </div>

  <div class="kb-hint" style="color:{theme.dim}40;">Space · R · N</div>

  <!-- Settings drawer -->
  {#if settingsOpen}
    <div class="drawer-overlay" onclick={cancelSettings}></div>
    <div class="settings-drawer">
      <div class="drawer-header">
        <span class="drawer-title">POMODORO SETTINGS</span>
        <button class="close-btn" onclick={cancelSettings}><Icon name="x" size={14} /></button>
      </div>

      <div class="setting-group">
        <label>Focus Minutes <span class="val">{draft.focusMinutes}</span></label>
        <input type="range" min="5" max="90" bind:value={draft.focusMinutes} />
      </div>
      <div class="setting-group">
        <label>Short Break <span class="val">{draft.shortBreakMinutes}</span></label>
        <input type="range" min="1" max="30" bind:value={draft.shortBreakMinutes} />
      </div>
      <div class="setting-group">
        <label>Long Break <span class="val">{draft.longBreakMinutes}</span></label>
        <input type="range" min="5" max="60" bind:value={draft.longBreakMinutes} />
      </div>
      <div class="setting-group">
        <label>Sessions Before Long <span class="val">{draft.sessionsBeforeLong}</span></label>
        <input type="range" min="2" max="8" bind:value={draft.sessionsBeforeLong} />
      </div>
      <div class="setting-group">
        <label>Color Theme</label>
        <select bind:value={draft.colorTheme}>
          <option value="cyan">Cyan</option>
          <option value="green">Green</option>
          <option value="pink">Pink</option>
          <option value="amber">Amber</option>
        </select>
      </div>
      <div class="setting-group">
        <label>Center Label</label>
        <input type="text" bind:value={draft.label} maxlength="12" />
      </div>
      <div class="setting-group toggle-row">
        <label>Auto-Start Next</label>
        <input type="checkbox" bind:checked={draft.autoStart} />
      </div>
      <div class="setting-group toggle-row">
        <label>Tick Sound</label>
        <input type="checkbox" bind:checked={draft.tickSound} />
      </div>

      <div class="drawer-footer">
        <button class="btn-cancel" onclick={cancelSettings}>Cancel</button>
        <button class="btn-save" onclick={saveSettings}>Save</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .pomodoro-wrap:focus { outline: none; }
  .pomodoro-wrap:focus-visible { outline: 1px solid var(--color, #00bfff); }

  .pomodoro-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    background: var(--bg);
    border: 1px solid var(--clr);
    border-radius: 8px;
    padding: 18px 12px 14px;
    box-shadow: 0 0 18px color-mix(in srgb, var(--glow) 20%, transparent);
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden;
    min-height: 320px;
  }

  .gear-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: var(--dim);
    font-size: 14px;
    cursor: pointer;
    padding: 2px;
    transition: color 0.2s;
    z-index: 5;
  }
  .gear-btn:hover { color: var(--clr); }

  .mode-pill {
    font-size: 9px;
    letter-spacing: 3px;
    border: 1px solid;
    border-radius: 20px;
    padding: 2px 10px;
    color: var(--clr);
  }

  .svg-wrap {
    transition: filter 0.15s;
  }
  .svg-wrap.flash {
    animation: ringFlash 0.3s ease 4;
  }
  @keyframes ringFlash {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(2.5); }
  }

  .dots-row {
    display: flex;
    gap: 8px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--dim);
    background: transparent;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .dot-done {
    background: var(--clr);
    border-color: var(--clr);
    box-shadow: 0 0 6px var(--glow);
  }
  .dot-current {
    border-color: var(--clr);
    animation: dotPulse 1s ease infinite;
  }
  @keyframes dotPulse {
    0%, 100% { box-shadow: 0 0 4px var(--glow); opacity: 1; }
    50% { box-shadow: 0 0 0 var(--glow); opacity: 0.4; }
  }

  .next-label {
    font-size: 8px;
    letter-spacing: 2px;
  }

  .ctrl-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ctrl-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    transition: color 0.2s, box-shadow 0.2s;
  }
  .ctrl-btn.reset, .ctrl-btn.skip {
    font-size: 18px;
    color: var(--dim);
    padding: 4px;
  }
  .ctrl-btn.reset:hover, .ctrl-btn.skip:hover { color: var(--clr); }
  .ctrl-btn.main {
    border: 1px solid;
    border-radius: 6px;
    padding: 6px 22px;
    font-size: 12px;
    letter-spacing: 2px;
  }

  .kb-hint {
    font-size: 8px;
    letter-spacing: 2px;
  }

  /* Settings drawer */
  .drawer-overlay {
    position: absolute;
    inset: 0;
    z-index: 8;
    background: transparent;
  }

  .settings-drawer {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--bg) 97%, black);
    border-left: 1px solid var(--clr);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideIn 0.2s ease;
    overflow-y: auto;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .drawer-title {
    font-size: 9px;
    letter-spacing: 3px;
    color: var(--clr);
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--dim);
    cursor: pointer;
    font-size: 14px;
  }
  .close-btn:hover { color: var(--clr); }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .setting-group label {
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--dim);
    display: flex;
    justify-content: space-between;
  }
  .setting-group .val {
    color: var(--clr);
  }
  .setting-group input[type="range"] {
    width: 100%;
    accent-color: var(--clr);
  }
  .setting-group input[type="text"],
  .setting-group select {
    background: #0d0d0d;
    border: 1px solid var(--dim);
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    padding: 4px 8px;
    font-family: 'Share Tech Mono', monospace;
    width: 100%;
  }
  .toggle-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .toggle-row label { flex-direction: row; }
  .toggle-row input[type="checkbox"] {
    accent-color: var(--clr);
    width: 16px;
    height: 16px;
  }

  .drawer-footer {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
  }
  .btn-cancel {
    flex: 1;
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #555;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    padding: 6px;
    cursor: pointer;
  }
  .btn-cancel:hover { color: #fff; border-color: #666; }
  .btn-save {
    flex: 1;
    background: var(--clr);
    border: none;
    border-radius: 4px;
    color: #000;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    padding: 6px;
    cursor: pointer;
    font-weight: 700;
    box-shadow: 0 0 10px var(--glow);
  }
  .btn-save:hover { filter: brightness(1.15); }
</style>
