<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';
  import { spotifyState, useSpotify } from '$lib/stores/spotify';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface SpotifySettings {
    barCount: number;        // 16 | 24 | 32 | 48
    colorTheme: string;      // 'green' | 'cyan' | 'pink' | 'gold' | 'purple'
    showAlbumArt: boolean;
    bpmSensitivity: number;  // 0.5–2.0
    showProgress: boolean;
  }

  interface NowPlaying {
    connected: boolean;
    playing: boolean;
    track: { name: string; artist: string; album: string; image: string | null; id: string } | null;
    bpm: number;
    energy: number;
    progress_ms: number;
    duration_ms: number;
    error?: string;
  }

  interface Playlist { id: string; name: string; uri: string; tracks: number; image: string | null; owner: string; }

  // ── Props ──────────────────────────────────────────────────────────────────
  const { settings = {}, onsettingschange }: {
    settings?: Partial<SpotifySettings>;
    onsettingschange?: (s: SpotifySettings) => void;
  } = $props();

  // ── Theme map ──────────────────────────────────────────────────────────────
  const THEMES: Record<string, { color: string; glow: string; border: string; bg: string }> = {
    green:  { color: '#1db954', glow: '#1db95466', border: '#1db954', bg: '#011a0a' },
    cyan:   { color: '#00e5ff', glow: '#00e5ff44', border: '#00e5ff', bg: '#001a1f' },
    pink:   { color: '#ff0099', glow: '#ff009944', border: '#ff0099', bg: '#1a0010' },
    gold:   { color: '#ffd700', glow: '#ffd70044', border: '#ffd700', bg: '#1a1500' },
    purple: { color: '#9b59b6', glow: '#9b59b644', border: '#9b59b6', bg: '#0d001a' },
  };

  // ── Local settings (merged with prop + localStorage) ───────────────────────
  const LS_KEY = 'leados_spotify_widget';

  function loadSettings(): SpotifySettings {
    const defaults: SpotifySettings = {
      barCount: 24,
      colorTheme: 'green',
      showAlbumArt: true,
      bpmSensitivity: 1.0,
      showProgress: true,
    };
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
      return { ...defaults, ...stored, ...settings };
    } catch {
      return { ...defaults, ...settings };
    }
  }

  let cfg = $state<SpotifySettings>(loadSettings());
  let settingsOpen = $state(false);

  const theme = $derived(THEMES[cfg.colorTheme] ?? THEMES.green);

  function saveSettings() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* noop */ }
    onsettingschange?.(cfg);
  }

  function setTheme(t: string)        { cfg = { ...cfg, colorTheme: t };      saveSettings(); }
  function setBarCount(n: number)     { cfg = { ...cfg, barCount: n };         saveSettings(); }
  function setBpmSens(v: number)      { cfg = { ...cfg, bpmSensitivity: v };   saveSettings(); }
  function toggleAlbumArt()           { cfg = { ...cfg, showAlbumArt: !cfg.showAlbumArt }; saveSettings(); }
  function toggleProgress()           { cfg = { ...cfg, showProgress: !cfg.showProgress }; saveSettings(); }

  // ── Now-playing state (from shared store) ─────────────────────────────────
  let unsubSpotify: (() => void) | null = null;

  // ── Fine-grained progress/volume/seek state (Mini-style) ──────────────────
  let progressMs = $state(0);
  let durationMs = $state(1);
  let volume = $state(70);
  let seeking = $state(false);
  let progressInterval: ReturnType<typeof setInterval>;

  // ── Playlist state ─────────────────────────────────────────────────────────
  let playlists = $state<Playlist[]>([]);
  let showPlaylists = $state(false);
  let loadingPlaylists = $state(false);
  let playlistsLoaded = $state(false);

  // ── Sync local progress/bpm from shared store on each poll ───────────────
  $effect(() => {
    if ($spotifyState.progress_ms !== undefined) {
      progressMs = $spotifyState.progress_ms;
      durationMs = $spotifyState.duration_ms;
    }
    bpm = $spotifyState.bpm;
  });

  // ── Bar visualizer ─────────────────────────────────────────────────────────
  let bars = $state<number[]>([]);
  let phase = 0;
  let bpm = 120;
  let lastBeat = 0;
  let beatKick = 1;
  let rafId: number | null = null;

  function animateBars(ts: number) {
    const barsCount = cfg.barCount;

    // Beat kick logic
    const beatInterval = 60000 / bpm;
    if (ts - lastBeat >= beatInterval) {
      lastBeat = ts;
      beatKick = 1.4;
    } else {
      beatKick = Math.max(1, beatKick - 0.04);
    }

    phase += (bpm / 60) * 0.008 * cfg.bpmSensitivity;

    const next: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const t = i / barsCount;
      const h =
        Math.abs(Math.sin(phase + t * 3.14)) * 0.40 +
        Math.abs(Math.sin(phase * 1.7 + t * 6.28)) * 0.25 +
        Math.abs(Math.sin(phase * 0.5 + t * 9.42)) * 0.20 +
        Math.abs(Math.sin(phase * 2.3 + t * 2.1)) * 0.15;
      next.push(Math.min(1, h * beatKick));
    }
    bars = next;
    rafId = requestAnimationFrame(animateBars);
  }

  // ── Progress derived from fine-grained state ───────────────────────────────
  const progressPct = $derived(durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0);

  function fmtMs(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    unsubSpotify = useSpotify();
    rafId = requestAnimationFrame(animateBars);
    progressInterval = setInterval(() => {
      if ($spotifyState.playing && !seeking) {
        progressMs = Math.min(progressMs + 1000, durationMs);
      }
    }, 1000);
  });

  onDestroy(() => {
    unsubSpotify?.();
    if (rafId !== null) cancelAnimationFrame(rafId);
    clearInterval(progressInterval);
  });

  // ── Playback controls ──────────────────────────────────────────────────────
  let ctrlLoading = $state(false);

  async function control(action: string, value?: number) {
    if (ctrlLoading) return;
    ctrlLoading = true;
    if (action === 'play') spotifyState.update(s => ({ ...s, playing: true }));
    if (action === 'pause') spotifyState.update(s => ({ ...s, playing: false }));
    await apiFetch('/api/spotify/control', { method: 'POST', body: JSON.stringify({ action, value }) });
    ctrlLoading = false;
  }

  async function seek(e: Event) {
    const input = e.target as HTMLInputElement;
    const pct = parseFloat(input.value);
    const posMs = (pct / 100) * durationMs;
    progressMs = posMs;
    seeking = false;
    await control('seek', posMs);
  }

  async function setVolume(e: Event) {
    volume = parseInt((e.target as HTMLInputElement).value);
    await control('volume', volume);
  }

  async function loadPlaylists() {
    if (playlistsLoaded) { showPlaylists = !showPlaylists; return; }
    loadingPlaylists = true;
    showPlaylists = true;
    const r = await apiFetch('/api/spotify/playlists');
    if (r.ok) {
      const d = await r.json();
      playlists = d.playlists ?? [];
      playlistsLoaded = true;
    }
    loadingPlaylists = false;
  }

  async function playPlaylist(uri: string) {
    showPlaylists = false;
    await apiFetch('/api/spotify/control', { method: 'POST', body: JSON.stringify({ action: 'context', contextUri: uri }) });
  }

  let connectingSpotify = $state(false);

  async function connectSpotify() {
    if (connectingSpotify) return;
    connectingSpotify = true;
    try {
      const r = await apiFetch('/api/spotify/auth');
      if (r.ok) {
        const data = await r.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error('No URL returned from Spotify auth');
          spotifyState.update(s => ({ ...s, error: 'Spotify not configured — add SPOTIFY_CLIENT_ID to Vercel env vars' }));
        }
      } else {
        const err = await r.json().catch(() => ({}));
        console.error('Spotify auth error:', err);
      }
    } catch (e) {
      console.error('Spotify connect failed:', e);
    } finally {
      connectingSpotify = false;
    }
  }
</script>

<!-- ── Markup ──────────────────────────────────────────────────────────────── -->
<div class="sb-root" style="--color:{theme.color};--glow:{theme.glow};--border:{theme.border};--bg:{theme.bg};--border-dim:color-mix(in srgb, {theme.color} 30%, #000);">

  <!-- Header row -->
  <div class="sb-header">
    <span class="sb-blink"></span>
    <span class="sb-label">SPOTIFY BEATS</span>
    <span class="sb-spacer"></span>
    {#if $spotifyState.connected && $spotifyState.playing && $spotifyState.bpm > 0}
      <span class="bpm-badge">{Math.round($spotifyState.bpm)} BPM</span>
    {/if}
    <button class="gear-btn" onclick={() => settingsOpen = !settingsOpen} aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>

  <!-- Visualizer bars (always shown) -->
  <div class="viz-area">
    {#each bars as h, i (i)}
      <div class="bar" style="height:{Math.max(4, h * 100)}%;opacity:{$spotifyState.playing ? 1 : 0.25};"></div>
    {/each}
  </div>

  <!-- State: not connected -->
  {#if !$spotifyState.connected}
    <div class="state-card">
      <div class="state-icon">🎵</div>
      <div class="state-msg">Spotify not connected</div>
      <button onclick={connectSpotify} disabled={connectingSpotify} class="connect-btn">
        {connectingSpotify ? 'Opening...' : 'Connect Spotify'}
      </button>
    </div>

  <!-- State: connected, paused -->
  {:else if !$spotifyState.playing}
    <div class="state-card dimmed">
      {#if $spotifyState.track}
        <div class="state-track">{$spotifyState.track.name}</div>
        <div class="state-artist">{$spotifyState.track.artist}</div>
        <button onclick={() => control('play')} class="ctrl-btn play-btn" disabled={ctrlLoading} aria-label="Play" style="margin-top:8px;font-size:1.2rem;">▶</button>
      {:else}
        <div class="state-icon">⏸</div>
        <div class="state-msg">Nothing playing</div>
      {/if}
    </div>

  <!-- State: playing -->
  {:else}
    <div class="now-playing">
      {#if cfg.showAlbumArt && $spotifyState.track?.image}
        <img class="album-art" src={$spotifyState.track.image} alt="Album art" />
      {/if}
      <div class="track-info">
        <div class="track-name">{$spotifyState.track?.name}</div>
        <div class="track-artist">{$spotifyState.track?.artist}</div>
        <div class="track-album">{$spotifyState.track?.album}</div>
        {#if cfg.showProgress && durationMs > 1}
          <!-- Interactive seek bar -->
          <div class="progress-row">
            <span class="prog-time">{fmtMs(progressMs)}</span>
            <div class="prog-track" style="flex:1;position:relative;">
              <input type="range" min="0" max="100"
                value={progressPct}
                oninput={(e) => { seeking = true; progressMs = (parseFloat((e.target as HTMLInputElement).value) / 100) * durationMs; }}
                onchange={seek}
                class="seek-slider" aria-label="Seek" />
            </div>
            <span class="prog-time">{fmtMs(durationMs)}</span>
          </div>
        {/if}
      </div>
    </div>
    <!-- Playback controls row -->
    <div class="controls-row" class:ctrl-loading={ctrlLoading}>
      <button onclick={() => control('previous')} class="ctrl-btn" disabled={ctrlLoading} aria-label="Previous">⏮</button>
      <button onclick={() => control($spotifyState.playing ? 'pause' : 'play')} class="ctrl-btn play-btn" disabled={ctrlLoading} aria-label={$spotifyState.playing ? 'Pause' : 'Play'}>
        {$spotifyState.playing ? '⏸' : '▶'}
      </button>
      <button onclick={() => control('next')} class="ctrl-btn" disabled={ctrlLoading} aria-label="Next">⏭</button>
    </div>
    <!-- Volume + Playlist row -->
    <div class="vol-row">
      🔈
      <input type="range" min="0" max="100" value={volume} onchange={setVolume}
        class="vol-slider" aria-label="Volume" style="flex:1;" />
      <button onclick={loadPlaylists} class="playlist-btn" title="Playlists" aria-label="Choose playlist">
        {loadingPlaylists ? '...' : '♫'}
      </button>
    </div>

    <!-- Playlist dropdown -->
    {#if showPlaylists}
      <div class="playlist-drop">
        <div class="playlist-panel-inner">
          <div class="playlist-hdr">
            <span>PLAYLISTS</span>
            <button onclick={() => showPlaylists = false} class="pl-close">✕</button>
          </div>
          {#if loadingPlaylists}
            <p class="pl-empty">Loading...</p>
          {:else if playlists.length === 0}
            <p class="pl-empty">No playlists found</p>
          {:else}
            <div class="pl-list">
              {#each playlists as pl}
                <button onclick={() => playPlaylist(pl.uri)} class="pl-item">
                  {#if pl.image}<img src={pl.image} alt={pl.name} class="pl-img" />{:else}<div class="pl-img pl-img-ph">♫</div>{/if}
                  <div class="pl-info">
                    <p class="pl-name">{pl.name}</p>
                    <p class="pl-meta">{pl.tracks} · {pl.owner}</p>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Settings panel -->
  {#if settingsOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="settings-backdrop" onclick={() => settingsOpen = false}></div>
    <div class="settings-panel">
      <div class="sp-title">SETTINGS</div>

      <div class="sp-section">COLOR THEME</div>
      <div class="sp-row theme-row">
        {#each Object.keys(THEMES) as t}
          <button
            class="theme-dot {cfg.colorTheme === t ? 'active' : ''}"
            style="background:{THEMES[t].color};box-shadow:{cfg.colorTheme === t ? `0 0 8px ${THEMES[t].color}` : 'none'}"
            onclick={() => setTheme(t)}
            title={t}
          ></button>
        {/each}
      </div>

      <div class="sp-section">BAR COUNT</div>
      <div class="sp-row">
        {#each [16, 24, 32, 48] as n}
          <button class="sp-chip {cfg.barCount === n ? 'active' : ''}" onclick={() => setBarCount(n)}>{n}</button>
        {/each}
      </div>

      <div class="sp-section">BPM SENSITIVITY · {cfg.bpmSensitivity.toFixed(1)}×</div>
      <input type="range" min="0.5" max="2.0" step="0.1"
        value={cfg.bpmSensitivity}
        oninput={(e) => setBpmSens(parseFloat((e.target as HTMLInputElement).value))}
        class="sp-slider"
      />

      <label class="sp-toggle">
        <input type="checkbox" checked={cfg.showAlbumArt} onchange={toggleAlbumArt} />
        <span>Show album art</span>
      </label>
      <label class="sp-toggle">
        <input type="checkbox" checked={cfg.showProgress} onchange={toggleProgress} />
        <span>Show progress bar</span>
      </label>
    </div>
  {/if}
</div>

<style>

  /* Root */
  .sb-root {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    box-sizing: border-box;
    font-family: 'Share Tech Mono', monospace;
  }
  .sb-root::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.06) 2px,
      rgba(0,0,0,0.06) 4px
    );
    pointer-events: none;
    z-index: 0;
  }
  .sb-root > * { position: relative; z-index: 1; }

  /* Header */
  .sb-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sb-blink {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--color);
    box-shadow: 0 0 8px var(--color);
    animation: blink 1.2s ease infinite;
    flex-shrink: 0;
  }
  .sb-label {
    font-size: 9px;
    letter-spacing: 3px;
    color: var(--color);
  }
  .sb-spacer { flex: 1; }

  .bpm-badge {
    font-size: 8px;
    letter-spacing: 1px;
    color: var(--color);
    border: 1px solid var(--border);
    padding: 1px 5px;
    border-radius: 3px;
    box-shadow: 0 0 6px var(--glow);
    animation: pulse 1s ease infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }

  .gear-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color);
    width: 18px; height: 18px;
    padding: 0;
    opacity: 0.6;
    transition: opacity 0.2s, transform 0.4s;
  }
  .gear-btn:hover { opacity: 1; transform: rotate(60deg); }
  .gear-btn svg { width: 100%; height: 100%; }

  /* Visualizer */
  .viz-area {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 52px;
    overflow: hidden;
  }
  .bar {
    flex: 1;
    background: var(--color);
    box-shadow: 0 0 4px var(--glow);
    border-radius: 2px 2px 0 0;
    min-height: 4px;
    transition: height 0.04s linear;
  }

  /* State cards */
  .state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
  }
  .state-card.dimmed { opacity: 0.5; }
  .state-icon { font-size: 22px; }
  .state-msg { font-size: 9px; letter-spacing: 2px; color: var(--color); opacity: 0.7; }
  .state-track { font-size: 11px; color: var(--color); }
  .state-artist { font-size: 9px; color: var(--color); opacity: 0.6; }

  .connect-btn {
    display: inline-block;
    margin-top: 4px;
    padding: 5px 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: var(--color);
    text-decoration: none;
    transition: background 0.2s, box-shadow 0.2s;
  }
  .connect-btn:hover {
    background: var(--glow);
    box-shadow: 0 0 10px var(--glow);
  }

  /* Now playing */
  .now-playing {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-height: 0;
    overflow: hidden;
  }
  .album-art {
    width: 54px;
    height: 54px;
    border-radius: 4px;
    box-shadow: 0 0 12px var(--glow);
    object-fit: cover;
    flex-shrink: 0;
  }
  .track-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .track-name {
    font-size: 11px;
    color: var(--color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 0 8px var(--glow);
  }
  .track-artist { font-size: 9px; color: var(--color); opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track-album  { font-size: 8px; color: var(--color); opacity: 0.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
  }
  .prog-time { font-size: 8px; color: var(--color); opacity: 0.5; }

  .seek-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 3px;
    background: var(--border-dim, #1a3010);
    border-radius: 2px; cursor: pointer; outline: none;
  }
  .seek-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    border-radius: 50%; background: var(--color); cursor: pointer;
    box-shadow: 0 0 5px var(--glow);
  }

  .vol-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 11px; color: var(--color); }
  .vol-slider {
    -webkit-appearance: none; appearance: none; height: 3px;
    border-radius: 2px; background: var(--border-dim, #1a3010);
    cursor: pointer; outline: none;
  }
  .vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    border-radius: 50%; background: var(--color); cursor: pointer;
    box-shadow: 0 0 5px var(--glow);
  }

  .playlist-btn {
    font-size: 13px; padding: 2px 8px;
    border: 1px solid var(--border-dim, #1a3010);
    color: var(--color); background: none; border-radius: 4px; cursor: pointer;
  }
  .playlist-btn:hover { background: color-mix(in srgb, var(--color) 15%, transparent); }

  .playlist-drop { margin-top: 4px; }
  .playlist-panel-inner {
    background: color-mix(in srgb, var(--color) 8%, #0a0a0a);
    border: 1px solid var(--border-dim, #1a3010);
    border-radius: 8px; overflow: hidden;
  }
  .playlist-hdr {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; border-bottom: 1px solid var(--border-dim, #1a3010);
    font-size: 9px; color: var(--color); letter-spacing: 1px;
  }
  .pl-close { background: none; border: none; cursor: pointer; color: #555; font-size: 11px; }
  .pl-close:hover { color: #ccc; }
  .pl-empty { padding: 16px; text-align: center; font-size: 11px; color: #555; margin: 0; }
  .pl-list { max-height: 200px; overflow-y: auto; }
  .pl-list::-webkit-scrollbar { width: 4px; }
  .pl-list::-webkit-scrollbar-track { background: transparent; }
  .pl-list::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--color) 30%, transparent); border-radius: 2px; }
  .pl-item {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 7px 12px; background: none; border: none;
    border-bottom: 1px solid var(--border-dim, #1a3010);
    cursor: pointer; text-align: left;
  }
  .pl-item:last-child { border-bottom: none; }
  .pl-item:hover { background: color-mix(in srgb, var(--color) 8%, transparent); }
  .pl-img { width: 32px; height: 32px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }
  .pl-img-ph {
    background: #1a1a1a; display: flex; align-items: center;
    justify-content: center; color: #555; font-size: 12px;
  }
  .pl-info { flex: 1; min-width: 0; }
  .pl-name { font-size: 11px; color: #ccc; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 180px; margin: 0; }
  .pl-meta { font-size: 9px; color: #555; margin: 1px 0 0; }

  /* Settings panel */
  .settings-backdrop {
    position: absolute;
    inset: 0;
    z-index: 10;
  }
  .settings-panel {
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 180px;
    background: rgba(0,0,0,0.92);
    border-left: 1px solid var(--border);
    padding: 12px 10px;
    z-index: 11;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    animation: slideIn 0.2s ease;
  }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

  .sp-title {
    font-size: 9px;
    letter-spacing: 3px;
    color: var(--color);
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    margin-bottom: 2px;
  }
  .sp-section {
    font-size: 7px;
    letter-spacing: 2px;
    color: var(--color);
    opacity: 0.6;
    margin-top: 4px;
  }
  .sp-row { display: flex; gap: 5px; flex-wrap: wrap; }

  .theme-row { gap: 6px; }
  .theme-dot {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 1px solid transparent;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .theme-dot.active { border-color: #fff; transform: scale(1.2); }

  .sp-chip {
    background: none;
    border: 1px solid var(--border);
    color: var(--color);
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
  }
  .sp-chip.active, .sp-chip:hover { opacity: 1; background: var(--glow); }

  .sp-slider {
    width: 100%;
    accent-color: var(--color);
    cursor: pointer;
  }

  .sp-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 9px;
    color: var(--color);
    opacity: 0.8;
  }
  .sp-toggle:hover { opacity: 1; }
  .sp-toggle input { accent-color: var(--color); cursor: pointer; }

  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

  /* Playback controls */
  .controls-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .ctrl-loading .ctrl-btn { opacity: 0.5; }

  .ctrl-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--color);
    font-size: 13px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    transition: box-shadow 0.15s, background 0.15s;
  }
  .ctrl-btn:hover:not(:disabled) {
    background: var(--g