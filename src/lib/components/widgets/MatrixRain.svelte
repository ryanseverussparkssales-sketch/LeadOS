<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface MatrixSettings {
    colorTheme: string;   // 'green'|'cyan'|'red'|'amber'|'pink'|'white'
    speed: string;        // 'slow'|'medium'|'fast'|'storm'
    overlayText: string;  // custom text or 'auto'
    showStats: boolean;
    charSet: string;      // 'japanese'|'binary'|'hex'|'mixed'
    fontSize: number;     // 10|12|14
  }

  interface LiveStats {
    callsToday: number;
    pipeline: string;
    tasks: number;
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  const { settings = {}, onsettingschange }: {
    settings?: Partial<MatrixSettings>;
    onsettingschange?: (s: MatrixSettings) => void;
  } = $props();

  // ── Theme definitions ──────────────────────────────────────────────────────
  const THEMES: Record<string, { bright: string; mid: string; fade: string; glow: string }> = {
    green: { bright: '#00ff00', mid: '#00aa00', fade: '#005500', glow: '#00ff0066' },
    cyan:  { bright: '#00ffff', mid: '#00aaaa', fade: '#005555', glow: '#00ffff55' },
    red:   { bright: '#ff0000', mid: '#aa0000', fade: '#550000', glow: '#ff000055' },
    amber: { bright: '#ffaa00', mid: '#aa6600', fade: '#553300', glow: '#ffaa0055' },
    pink:  { bright: '#ff00ff', mid: '#aa00aa', fade: '#550055', glow: '#ff00ff55' },
    white: { bright: '#ffffff', mid: '#aaaaaa', fade: '#444444', glow: '#ffffff44' },
  };

  const SPEED_MAP: Record<string, number> = { slow: 60, medium: 40, fast: 25, storm: 15 };

  // Character sets
  const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const BINARY   = '01';
  const HEX      = '0123456789ABCDEF';
  const MIXED    = KATAKANA + BINARY + HEX + '!@#$%^&*()_+-=[]{}|;:,./<>?';

  const CHAR_SETS: Record<string, string> = {
    japanese: KATAKANA,
    binary:   BINARY,
    hex:      HEX,
    mixed:    MIXED,
  };

  // ── localStorage ───────────────────────────────────────────────────────────
  const LS_KEY = 'leados_matrix_widget';

  function loadSettings(): MatrixSettings {
    const defaults: MatrixSettings = {
      colorTheme: 'green',
      speed: 'medium',
      overlayText: 'auto',
      showStats: true,
      charSet: 'japanese',
      fontSize: 12,
    };
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
      return { ...defaults, ...stored, ...settings };
    } catch {
      return { ...defaults, ...settings };
    }
  }

  let cfg = $state<MatrixSettings>(loadSettings());
  let settingsOpen = $state(false);

  const theme = $derived(THEMES[cfg.colorTheme] ?? THEMES.green);

  function saveSettings() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* noop */ }
    onsettingschange?.(cfg);
  }

  // ── Canvas + animation ─────────────────────────────────────────────────────
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let wrapEl: HTMLDivElement | undefined = $state();

  // Column state
  type Column = { y: number; speed: number; highlight: boolean; chars: string[] };
  let cols: Column[] = [];
  let colCount = 0;
  let rafId: number = 0;
  let lastFrameTime = 0;
  let resizeObserver: ResizeObserver | null = null;
  let resizeTimeout: ReturnType<typeof setTimeout>;

  function randChar(charSet: string) {
    return charSet[Math.floor(Math.random() * charSet.length)];
  }

  function buildCols(w: number, h: number) {
    const fs = cfg.fontSize;
    colCount = Math.floor(w / (fs * 0.7));
    const rows = Math.ceil(h / fs) + 4;
    cols = Array.from({ length: colCount }, () => ({
      y: -Math.floor(Math.random() * rows),
      speed: 0.7 + Math.random() * 0.6,
      highlight: Math.random() < 0.12,
      chars: Array.from({ length: rows }, () => randChar(CHAR_SETS[cfg.charSet] ?? KATAKANA)),
    }));
  }

  function drawFrame() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;
    const fs = cfg.fontSize;
    const colW = w / colCount;
    const charSet = CHAR_SETS[cfg.charSet] ?? KATAKANA;
    const t = THEMES[cfg.colorTheme] ?? THEMES.green;

    // Fade trail
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = `${fs}px 'Share Tech Mono', monospace`;

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const x = i * colW + colW / 2;

      // Advance char refresh randomly
      if (Math.random() < 0.1) {
        const row = Math.floor(Math.random() * col.chars.length);
        col.chars[row] = randChar(charSet);
      }

      // Draw trail chars
      const trailLen = Math.min(16, Math.floor(h / fs));
      for (let j = trailLen; j >= 0; j--) {
        const row = Math.floor(col.y) - j;
        if (row < 0 || row >= col.chars.length) continue;
        const cy = row * fs;
        if (cy < 0 || cy > h) continue;

        const char = col.chars[row];
        const frac = 1 - j / trailLen;

        if (j === 0) {
          // Head — brightest
          ctx.fillStyle = col.highlight ? '#ffffff' : t.bright;
          if (col.highlight) ctx.shadowBlur = 18;
          else ctx.shadowBlur = 10;
          ctx.shadowColor = col.highlight ? t.bright : t.bright;
        } else if (j <= 2) {
          ctx.fillStyle = t.bright;
          ctx.shadowBlur = 6;
          ctx.shadowColor = t.bright;
        } else if (frac > 0.5) {
          ctx.fillStyle = t.mid;
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = t.fade;
          ctx.shadowBlur = 0;
        }

        ctx.textAlign = 'center';
        ctx.fillText(char, x, cy);
      }

      // Advance column
      col.y += col.speed;
      const totalRows = Math.ceil(h / fs) + 18;
      if (col.y > totalRows) {
        col.y = -Math.floor(Math.random() * 12);
        col.highlight = Math.random() < 0.12;
        col.speed = 0.7 + Math.random() * 0.6;
      }
    }

    ctx.shadowBlur = 0;
  }

  function drawLoop(ts: number) {
    const intervalMs = SPEED_MAP[cfg.speed] ?? 40;
    if (ts - lastFrameTime >= intervalMs) {
      lastFrameTime = ts;
      drawFrame();
    }
    rafId = requestAnimationFrame(drawLoop);
  }

  function startAnimation() {
    stopAnimation();
    lastFrameTime = 0;
    rafId = requestAnimationFrame(drawLoop);
  }

  function stopAnimation() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function sizeCanvas() {
    if (!canvasEl || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w === canvasEl.width && h === canvasEl.height) return;
    canvasEl.width = w;
    canvasEl.height = h;
    buildCols(w, h);
  }

  // ── Live stats ─────────────────────────────────────────────────────────────
  let liveStats = $state<LiveStats | null>(null);
  let statsTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchStats() {
    try {
      const res = await apiFetch('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        liveStats = {
          callsToday: data.calls_today ?? data.callsToday ?? 0,
          pipeline: data.pipeline_value != null
            ? `$${Number(data.pipeline_value).toLocaleString()}`
            : (data.total_pipeline != null ? `$${Number(data.total_pipeline).toLocaleString()}` : '—'),
          tasks: data.open_tasks ?? data.tasks ?? 0,
        };
      }
    } catch { /* non-fatal */ }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    sizeCanvas();
    startAnimation();

    resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => sizeCanvas(), 100);
    });
    if (wrapEl) resizeObserver.observe(wrapEl);

    if (cfg.showStats) {
      fetchStats();
      statsTimer = setInterval(fetchStats, 30000);
    }
  });

  onDestroy(() => {
    stopAnimation();
    clearTimeout(resizeTimeout);
    resizeObserver?.disconnect();
    if (statsTimer) clearInterval(statsTimer);
  });

  // Re-start animation when speed or charSet changes
  $effect(() => {
    void cfg.speed;
    void cfg.charSet;
    void cfg.fontSize;
    void cfg.colorTheme;
    if (canvasEl) {
      buildCols(canvasEl.width, canvasEl.height);
      startAnimation();
    }
  });

  // Toggle stats polling on showStats change
  $effect(() => {
    if (cfg.showStats) {
      fetchStats();
      if (!statsTimer) statsTimer = setInterval(fetchStats, 30000);
    } else {
      if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    }
  });

  // Settings helpers
  function setTheme(t: string)      { cfg = { ...cfg, colorTheme: t };  saveSettings(); }
  function setSpeed(s: string)      { cfg = { ...cfg, speed: s };        saveSettings(); }
  function setCharSet(c: string)    { cfg = { ...cfg, charSet: c };      saveSettings(); }
  function setFontSize(n: number)   { cfg = { ...cfg, fontSize: n };     saveSettings(); }
  function setOverlayText(v: string){ cfg = { ...cfg, overlayText: v };  saveSettings(); }
  function toggleStats()            { cfg = { ...cfg, showStats: !cfg.showStats }; saveSettings(); }
</script>

<!-- ── Markup ──────────────────────────────────────────────────────────────── -->
<div
  class="mr-root"
  style="--bright:{theme.bright};--mid:{theme.mid};--fade:{theme.fade};--glow:{theme.glow};"
  bind:this={wrapEl}
>
  <!-- Canvas -->
  <canvas class="mr-canvas" bind:this={canvasEl}></canvas>

  <!-- Scanline overlay -->
  <div class="scanlines" aria-hidden="true"></div>

  <!-- Header -->
  <div class="mr-header">
    <span class="mr-blink"></span>
    <span class="mr-label">MATRIX RAIN</span>
    <span class="mr-spacer"></span>
    <button class="gear-btn" onclick={() => settingsOpen = !settingsOpen} aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>

  <!-- Center custom text overlay -->
  {#if cfg.overlayText !== 'auto' && cfg.overlayText.trim() !== ''}
    <div class="center-text" style="text-shadow: 0 0 20px var(--bright), 0 0 40px var(--glow);">
      {cfg.overlayText}
    </div>
  {/if}

  <!-- Live stats overlay -->
  {#if cfg.showStats && (cfg.overlayText === 'auto' || cfg.overlayText.trim() === '')}
    <div class="stats-card" style="border-color:var(--bright);box-shadow:0 0 20px var(--glow),inset 0 0 20px rgba(0,0,0,0.6);">
      <div class="stats-title">◈ LEAD OS LIVE</div>
      {#if liveStats}
        <div class="stats-row">
          <span class="stats-key">CALLS TODAY</span>
          <span class="stats-val">{liveStats.callsToday}</span>
        </div>
        <div class="stats-row">
          <span class="stats-key">PIPELINE</span>
          <span class="stats-val">{liveStats.pipeline}</span>
        </div>
        <div class="stats-row">
          <span class="stats-key">OPEN TASKS</span>
          <span class="stats-val">{liveStats.tasks}</span>
        </div>
      {:else}
        <div class="stats-loading">LOADING...</div>
      {/if}
    </div>
  {/if}

  <!-- Settings panel -->
  {#if settingsOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="settings-backdrop" onclick={() => settingsOpen = false}></div>
    <div class="settings-panel" style="border-left-color:var(--bright);">
      <div class="sp-title">SETTINGS</div>

      <div class="sp-section">COLOR THEME</div>
      <div class="sp-row theme-row">
        {#each Object.keys(THEMES) as t}
          <button
            class="theme-dot {cfg.colorTheme === t ? 'active' : ''}"
            style="background:{THEMES[t].bright};box-shadow:{cfg.colorTheme === t ? `0 0 8px ${THEMES[t].bright}` : 'none'}"
            onclick={() => setTheme(t)}
            title={t}
          ></button>
        {/each}
      </div>

      <div class="sp-section">SPEED</div>
      <div class="sp-row">
        {#each ['slow','medium','fast','storm'] as s}
          <button class="sp-chip {cfg.speed === s ? 'active' : ''}" onclick={() => setSpeed(s)}>{s}</button>
        {/each}
      </div>

      <div class="sp-section">CHAR SET</div>
      <div class="sp-row">
        {#each ['japanese','binary','hex','mixed'] as c}
          <button class="sp-chip {cfg.charSet === c ? 'active' : ''}" onclick={() => setCharSet(c)}>{c}</button>
        {/each}
      </div>

      <div class="sp-section">FONT SIZE</div>
      <div class="sp-row">
        {#each [10, 12, 14] as n}
          <button class="sp-chip {cfg.fontSize === n ? 'active' : ''}" onclick={() => setFontSize(n)}>{n}px</button>
        {/each}
      </div>

      <div class="sp-section">OVERLAY TEXT</div>
      <input
        class="sp-input"
        type="text"
        placeholder="'auto' or custom text"
        value={cfg.overlayText}
        oninput={(e) => setOverlayText((e.target as HTMLInputElement).value)}
      />

      <label class="sp-toggle">
        <input type="checkbox" checked={cfg.showStats} onchange={toggleStats} />
        <span>Show live stats</span>
      </label>
    </div>
  {/if}
</div>

<style>
  /* Root — fills widget slot */
  .mr-root {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 160px;
    background: #000;
    border: 1px solid var(--bright);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 0 24px var(--glow), inset 0 0 40px rgba(0,0,0,0.8);
    font-family: 'Share Tech Mono', monospace;
    box-sizing: border-box;
  }

  /* Canvas fills entirely */
  .mr-canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  /* CRT scanlines */
  .scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.15) 2px,
      rgba(0,0,0,0.15) 4px
    );
    pointer-events: none;
    z-index: 2;
  }
  /* Corner vignette */
  .mr-root::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.55) 100%);
    pointer-events: none;
    z-index: 3;
  }

  /* Header */
  .mr-header {
    position: absolute;
    top: 0; left: 0; right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    z-index: 10;
    background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%);
  }
  .mr-blink {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--bright);
    box-shadow: 0 0 8px var(--bright);
    animation: blink 1.2s ease infinite;
    flex-shrink: 0;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  .mr-label {
    font-size: 9px;
    letter-spacing: 3px;
    color: var(--bright);
    text-shadow: 0 0 8px var(--glow);
  }
  .mr-spacer { flex: 1; }

  .gear-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--bright);
    width: 18px; height: 18px;
    padding: 0;
    opacity: 0.6;
    transition: opacity 0.2s, transform 0.4s;
  }
  .gear-btn:hover { opacity: 1; transform: rotate(60deg); }
  .gear-btn svg { width: 100%; height: 100%; }

  /* Center text overlay */
  .center-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(14px, 3vw, 28px);
    letter-spacing: 6px;
    color: var(--bright);
    z-index: 8;
    pointer-events: none;
    text-align: center;
    padding: 20px;
    font-weight: 700;
    animation: textPulse 3s ease infinite;
  }
  @keyframes textPulse {
    0%,100% { opacity:1; text-shadow: 0 0 20px var(--bright), 0 0 40px var(--glow); }
    50%      { opacity:0.75; text-shadow: 0 0 10px var(--bright), 0 0 20px var(--glow); }
  }

  /* Stats card */
  .stats-card {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    min-width: 160px;
    background: rgba(0,0,0,0.75);
    border: 1px solid var(--bright);
    border-radius: 6px;
    padding: 10px 14px;
    z-index: 9;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .stats-title {
    font-size: 8px;
    letter-spacing: 3px;
    color: var(--bright);
    text-align: center;
    margin-bottom: 8px;
    text-shadow: 0 0 8px var(--glow);
  }
  .stats-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 2px 0;
  }
  .stats-key {
    font-size: 7px;
    letter-spacing: 2px;
    color: var(--mid);
  }
  .stats-val {
    font-size: 12px;
    color: var(--bright);
    text-shadow: 0 0 8px var(--glow);
  }
  .stats-loading {
    font-size: 8px;
    letter-spacing: 3px;
    color: var(--mid);
    text-align: center;
    animation: blink 1s ease infinite;
  }

  /* Settings */
  .settings-backdrop {
    position: absolute;
    inset: 0;
    z-index: 20;
  }
  .settings-panel {
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 186px;
    background: rgba(0,0,0,0.95);
    border-left: 1px solid var(--bright);
    padding: 12px 10px;
    z-index: 21;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    animation: slideIn 0.2s ease;
    box-shadow: -8px 0 24px var(--glow);
  }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

  .sp-title {
    font-size: 9px;
    letter-spacing: 3px;
    color: var(--bright);
    text-shadow: 0 0 8px var(--glow);
    border-bottom: 1px solid var(--mid);
    padding-bottom: 6px;
  }
  .sp-section {
    font-size: 7px;
    letter-spacing: 2px;
    color: var(--mid);
    margin-top: 4px;
  }
  .sp-row { display: flex; gap: 5px; flex-wrap: wrap; }
  .theme-row { gap: 7px; }

  .theme-dot {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 1px solid transparent;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .theme-dot.active { border-color: #fff; transform: scale(1.25); }

  .sp-chip {
    background: none;
    border: 1px solid var(--fade);
    color: var(--mid);
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    padding: 2px 5px;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
    letter-spacing: 1px;
  }
  .sp-chip.active, .sp-chip:hover {
    opacity: 1;
    border-color: var(--bright);
    color: var(--bright);
    background: rgba(0,0,0,0.5);
    box-shadow: 0 0 6px var(--glow);
  }

  .sp-input {
    background: rgba(0,0,0,0.7);
    border: 1px solid var(--mid);
    color: var(--bright);
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    padding: 4px 6px;
    border-radius: 3px;
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }
  .sp-input:focus { border-color: var(--bright); box-shadow: 0 0 6px var(--glow); }

  .sp-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 9px;
    color: var(--mid);
    transition: color 0.15s;
    letter-spacing: 1px;
  }
  .sp-toggle:hover { color: var(--bright); }
  .sp-toggle input { accent-color: var(--bright); cursor: pointer; }
</style>
