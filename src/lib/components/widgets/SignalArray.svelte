<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';

  let svgEl: SVGElement;
  let animFrame: number;
  let phase = 0;
  let pendingTasks = $state(0);
  let answerRate = $state(0);
  let avgDuration = $state('—');
  let activeCalls = $state(0);
  let callsToday = $state(0);
  let voicemails = $state(0);

  // Customizable stats
  const SIGNAL_STATS_KEY = 'leados_signal_stats';
  const SIGNAL_AVAILABLE = [
    { id: 'active', label: 'ACTIVE' },
    { id: 'avg_dur', label: 'AVG DUR' },
    { id: 'pending', label: 'PENDING' },
    { id: 'answer', label: 'ANSWER%' },
    { id: 'calls_today', label: 'CALLS' },
    { id: 'voicemails', label: 'VMs' },
  ];
  let signalStats = $state(['active', 'avg_dur', 'pending', 'answer']);
  let showSignalPicker = $state(false);

  const signalValues = $derived((() => {
    const vals: Record<string, { label: string; display: string }> = {};
    vals['active'] = { label: 'ACTIVE', display: String(activeCalls) };
    vals['avg_dur'] = { label: 'AVG DUR', display: avgDuration };
    vals['pending'] = { label: 'PENDING', display: String(pendingTasks) };
    vals['answer'] = { label: 'ANSWER%', display: `${answerRate}%` };
    vals['calls_today'] = { label: 'CALLS', display: String(callsToday) };
    vals['voicemails'] = { label: 'VMs', display: String(voicemails) };
    return vals;
  })());

  function drawWave() {
    if (!svgEl) return;
    const w = 180, h = 50;
    const pts1: string[] = [], pts2: string[] = [];
    for (let x = 0; x <= w; x += 1.5) {
      const t = (x / w) * Math.PI * 2;
      const y = h/2 + 10 * Math.sin(t * 3 + phase)
                    + 4 * Math.sin(t * 7 + phase * 1.4)
                    + 2 * Math.sin(t * 13 + phase * 0.6)
                    + 1.5 * Math.cos(t * 19 + phase * 0.9);
      const y2 = h/2 + 7 * Math.sin(t * 5 + phase * 0.7)
                     + 3 * Math.sin(t * 11 + phase * 1.2);
      pts1.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      pts2.push(`${x.toFixed(1)},${y2.toFixed(1)}`);
    }
    const l1 = svgEl.querySelector('#wave1') as SVGPolylineElement | null;
    const l2 = svgEl.querySelector('#wave2') as SVGPolylineElement | null;
    if (l1) l1.setAttribute('points', pts1.join(' '));
    if (l2) l2.setAttribute('points', pts2.join(' '));
    phase += 0.05;
    animFrame = requestAnimationFrame(drawWave);
  }

  onMount(async () => {
    // Load persisted stat selection
    try { signalStats = JSON.parse(localStorage.getItem(SIGNAL_STATS_KEY) ?? '["active","avg_dur","pending","answer"]'); } catch {}

    drawWave();
    try {
      const [callsRes, tasksRes] = await Promise.all([
        apiFetch('/api/calls?limit=100'),
        apiFetch('/api/tasks?status=pending'),
      ]);
      if (callsRes.ok) {
        const calls: any[] = await callsRes.json();
        const today = new Date().toISOString().slice(0, 10);
        const todayCalls = calls.filter((c: any) => c.created_at?.slice(0, 10) === today);
        callsToday = todayCalls.length;
        const answered = todayCalls.filter((c: any) => c.outcome === 'answered');
        answerRate = todayCalls.length > 0 ? Math.round((answered.length / todayCalls.length) * 100) : 0;
        voicemails = todayCalls.filter((c: any) => c.outcome === 'voicemail').length;
        const durations = calls.filter((c: any) => c.call_duration_seconds).map((c: any) => c.call_duration_seconds);
        if (durations.length > 0) {
          const avg = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
          avgDuration = `${Math.floor(avg / 60)}m ${Math.round(avg % 60)}s`;
        }
      }
      if (tasksRes.ok) { const t: any[] = await tasksRes.json(); pendingTasks = t.length; }
    } catch { /* non-fatal */ }
  });

  onDestroy(() => cancelAnimationFrame(animFrame));
</script>

<div class="signal-array">
  <div class="header">
    <span class="blink-dot"></span>
    <span class="label">SIGNAL ARRAY</span>
    <span class="status-pill">● UPLINK NOMINAL</span>
  </div>
  <div class="content">
    <svg bind:this={svgEl} class="wave-svg" viewBox="0 0 180 50" preserveAspectRatio="none">
      <defs>
        <filter id="wglow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <polyline id="wave1" points="" fill="none" stroke="#0f3" stroke-width="1.5" filter="url(#wglow)"/>
      <polyline id="wave2" points="" fill="none" stroke="#063" stroke-width="0.8" opacity="0.6"/>
    </svg>
    <div class="stats-grid-wrap">
      <div class="stats-grid">
        {#each signalStats.slice(0, 4) as statId}
          {#if signalValues[statId]}
            {@const stat = signalValues[statId]}
            <div class="sig-stat">
              <div class="sig-num">{stat.display}</div>
              <div class="sig-lbl">{stat.label}</div>
            </div>
          {/if}
        {/each}
      </div>
      <button onclick={() => showSignalPicker = !showSignalPicker} class="signal-settings-btn" aria-label="Customize stats">
        {showSignalPicker ? '✕' : '⚙'}
      </button>
      {#if showSignalPicker}
        <div class="signal-picker">
          <p class="signal-picker-label">CHOOSE 4 STATS</p>
          {#each SIGNAL_AVAILABLE as s}
            <label class="signal-picker-row">
              <input type="checkbox"
                checked={signalStats.includes(s.id)}
                disabled={!signalStats.includes(s.id) && signalStats.length >= 4}
                onchange={(e) => {
                  if ((e.target as HTMLInputElement).checked) {
                    if (signalStats.length < 4) signalStats = [...signalStats, s.id];
                  } else {
                    signalStats = signalStats.filter(x => x !== s.id);
                  }
                  localStorage.setItem(SIGNAL_STATS_KEY, JSON.stringify(signalStats));
                }} />
              <span>{s.label}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .signal-array { background: #020a04; border: 1px solid #0f3; border-radius: 6px; padding: 12px; position: relative; overflow: hidden; }
  .header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .label { font-family: 'Share Tech Mono', monospace; font-size: 9px; letter-spacing: 3px; color: #0f3; flex: 1; }
  .status-pill { font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0f3; letter-spacing: 1px; border: 1px solid #0f3; padding: 1px 7px; border-radius: 10px; background: #001a08; animation: pulse 2s ease infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
  .blink-dot { width: 6px; height: 6px; border-radius: 50%; background: #0f3; box-shadow: 0 0 8px #0f3; animation: blink 1.2s ease infinite; flex-shrink: 0; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
  .content { display: flex; gap: 12px; align-items: center; }
  .wave-svg { flex: 1; height: 50px; }
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .sig-stat { text-align: center; }
  .sig-num { font-family: 'Orbitron', monospace; font-size: 15px; font-weight: 700; color: #0f3; text-shadow: 0 0 10px #0f3; line-height: 1; }
  .sig-lbl { font-family: 'Share Tech Mono', monospace; font-size: 7px; letter-spacing: 2px; color: #0a4; margin-top: 2px; }
  .stats-grid-wrap { position: relative; display: flex; flex-direction: column; align-items: flex-end; }
  .signal-settings-btn { font-size: 9px; color: #0a4; background: none; border: none; cursor: pointer; padding: 2px 0; opacity: 0.6; transition: opacity 0.15s; font-family: 'Share Tech Mono', monospace; margin-top: 2px; }
  .signal-settings-btn:hover { opacity: 1; }
  .signal-picker { background: #020a04; border: 1px solid #0a3; border-radius: 6px; padding: 8px; position: absolute; top: 100%; right: 0; z-index: 10; min-width: 120px; }
  .signal-picker-label { font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0a4; letter-spacing: 2px; margin-bottom: 4px; margin-top: 0; }
  .signal-picker-row { display: flex; align-items: center; gap: 4px; padding: 2px 0; cursor: pointer; }
  .signal-picker-row input { accent-color: #0f3; }
  .signal-picker-row span { font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #0a4; letter-spacing: 1px; }
</style>
