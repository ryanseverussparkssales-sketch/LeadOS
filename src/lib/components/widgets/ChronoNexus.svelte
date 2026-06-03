<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';

  let now = $state(new Date());
  let callsToday = $state(0);
  let callGoal = $state(50);
  let connectRate = $state(0);
  let pipelineValue = $state(0);
  let pipelineGoal = $state(25000);
  let pendingTasks = $state(0);
  let answeredCalls = $state(0);
  let clockInterval: ReturnType<typeof setInterval>;

  // 12-hour clock
  const hours12 = $derived((() => {
    const h = now.getHours() % 12 || 12;
    return String(h).padStart(2, '0');
  })());
  const ampm = $derived(now.getHours() >= 12 ? 'PM' : 'AM');
  const mins = $derived(String(now.getMinutes()).padStart(2, '0'));
  const secs = $derived(String(now.getSeconds()).padStart(2, '0'));

  const secFrac = $derived(now.getSeconds() / 60);
  const minFrac = $derived((now.getMinutes() * 60 + now.getSeconds()) / 3600);
  const hrFrac = $derived(((now.getHours() % 12) * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 43200);

  function arcDash(r: number, frac: number) {
    const circ = 2 * Math.PI * r;
    return `${circ * Math.min(frac, 0.9999)} ${circ}`;
  }

  // Customizable stats
  const AVAILABLE_STATS = [
    { id: 'calls_today', label: 'CALLS TODAY', target: 50 },
    { id: 'connect_rate', label: 'CONNECT RATE', target: 100, suffix: '%' },
    { id: 'pipeline', label: 'PIPELINE', prefix: '$' },
    { id: 'tasks_pending', label: 'TASKS DUE', target: 10 },
    { id: 'answered_calls', label: 'ANSWERED', target: 20 },
    { id: 'deals_active', label: 'ACTIVE DEALS' },
    { id: 'time_today', label: 'TIME TODAY', suffix: 'h' },
    { id: 'revenue_month', label: 'REVENUE', prefix: '$' },
  ];

  const STATS_KEY = 'leados_chrono_stats';
  let selectedStats = $state<string[]>(['calls_today', 'connect_rate', 'pipeline']);
  let showStatPicker = $state(false);

  const statValues = $derived((() => {
    const vals: Record<string, { label: string; value: number; target?: number; prefix?: string; suffix?: string }> = {};
    vals['calls_today'] = { label: 'CALLS TODAY', value: callsToday, target: callGoal };
    vals['connect_rate'] = { label: 'CONNECT RATE', value: connectRate, target: 100, suffix: '%' };
    vals['pipeline'] = { label: 'PIPELINE', value: pipelineValue, target: pipelineGoal, prefix: '$' };
    vals['tasks_pending'] = { label: 'TASKS', value: pendingTasks, target: 10 };
    vals['answered_calls'] = { label: 'ANSWERED', value: answeredCalls, target: 20 };
    vals['deals_active'] = { label: 'ACTIVE DEALS', value: 0 };
    vals['time_today'] = { label: 'TIME TODAY', value: 0, suffix: 'h' };
    vals['revenue_month'] = { label: 'REVENUE', value: 0, prefix: '$' };
    return vals;
  })());

  onMount(async () => {
    // Load persisted stat selection
    const stored = localStorage.getItem(STATS_KEY);
    if (stored) try { selectedStats = JSON.parse(stored); } catch {}

    clockInterval = setInterval(() => { now = new Date(); }, 1000);
    try {
      const [callsRes, analyticsRes, tasksRes] = await Promise.all([
        apiFetch('/api/calls?limit=1000'),
        apiFetch('/api/analytics'),
        apiFetch('/api/tasks?status=pending'),
      ]);
      if (callsRes.ok) {
        const calls: any[] = await callsRes.json();
        const today = new Date().toISOString().slice(0, 10);
        const todayCalls = calls.filter((c: any) => c.created_at?.slice(0, 10) === today);
        callsToday = todayCalls.length;
        const answered = todayCalls.filter((c: any) => c.outcome === 'answered').length;
        answeredCalls = answered;
        connectRate = todayCalls.length > 0 ? Math.round((answered / todayCalls.length) * 100) : 0;
      }
      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        pipelineValue = data.pipeline_value ?? data.total_pipeline ?? 0;
      }
      if (tasksRes.ok) {
        const t = await tasksRes.json();
        pendingTasks = t.length ?? 0;
      }
    } catch { /* non-fatal */ }
  });

  onDestroy(() => clearInterval(clockInterval));
</script>

<div class="chrono-nexus">
  <div class="widget-header">
    <span class="blink-dot"></span>
    <span class="label">CHRONO NEXUS</span>
  </div>
  <div class="content">
    <svg class="clock-svg" viewBox="0 0 120 120">
      <!-- Base rings -->
      <circle cx="60" cy="60" r="55" fill="none" stroke="#061a08" stroke-width="1.5"/>
      <circle cx="60" cy="60" r="44" fill="none" stroke="#041208" stroke-width="1" stroke-dasharray="3 4"/>
      <circle cx="60" cy="60" r="33" fill="none" stroke="#030e06" stroke-width="0.5"/>
      <!-- Arc sweeps -->
      <circle cx="60" cy="60" r="55" fill="none" stroke="#00ff44" stroke-width="2.5"
        stroke-dasharray={arcDash(55, secFrac)} stroke-linecap="round"
        transform="rotate(-90 60 60)" style="filter:drop-shadow(0 0 4px #00ff44)"/>
      <circle cx="60" cy="60" r="44" fill="none" stroke="#00bb33" stroke-width="2"
        stroke-dasharray={arcDash(44, minFrac)} stroke-linecap="round"
        transform="rotate(-90 60 60)"/>
      <circle cx="60" cy="60" r="33" fill="none" stroke="#007722" stroke-width="2"
        stroke-dasharray={arcDash(33, hrFrac)} stroke-linecap="round"
        transform="rotate(-90 60 60)"/>
      <!-- Tick marks -->
      {#each {length: 12} as _, i}
        <line x1="60" y1="6" x2="60" y2="13"
          transform="rotate({i * 30} 60 60)"
          stroke="#0a3" stroke-width="1"/>
      {/each}
      <!-- Center display -->
      <text x="60" y="54" text-anchor="middle" dominant-baseline="central"
        style="font-family:'Share Tech Mono',monospace;font-size:14px;fill:#00ff44;font-weight:700;letter-spacing:1px">{hours12}:{mins}</text>
      <text x="60" y="65" text-anchor="middle"
        style="font-family:'Share Tech Mono',monospace;font-size:8px;fill:#00882a">{secs} <tspan style="font-size:7px;fill:#00aa33">{ampm}</tspan></text>
      <text x="60" y="77" text-anchor="middle"
        style="font-family:'Share Tech Mono',monospace;font-size:7px;fill:#044;letter-spacing:3px">LOCAL</text>
      <circle cx="60" cy="60" r="3" fill="#00ff44" style="filter:drop-shadow(0 0 4px #00ff44)"/>
    </svg>

    <div class="stats-col">
      {#each selectedStats.slice(0, 3) as statId}
        {#if statValues[statId]}
          {@const stat = statValues[statId]}
          <div class="stat">
            <div class="stat-label">{stat.label}</div>
            <div class="stat-bar">
              <div class="stat-fill" style="width:{stat.target ? Math.min((stat.value / stat.target) * 100, 100) : Math.min(stat.value, 100)}%"></div>
            </div>
            <div class="stat-val">
              {stat.prefix ?? ''}{stat.value?.toLocaleString()}{stat.suffix ?? ''}
              {#if stat.target}<span class="stat-denom"> / {stat.prefix ?? ''}{stat.target}{stat.suffix ?? ''}</span>{/if}
            </div>
          </div>
        {/if}
      {/each}

      <button onclick={() => showStatPicker = !showStatPicker} class="stat-settings-btn" aria-label="Customize stats">
        {showStatPicker ? '✕' : '⚙'}
      </button>

      {#if showStatPicker}
        <div class="stat-picker">
          <p class="stat-picker-label">CHOOSE 3 STATS</p>
          {#each AVAILABLE_STATS as s}
            <label class="stat-picker-row">
              <input type="checkbox"
                checked={selectedStats.includes(s.id)}
                disabled={!selectedStats.includes(s.id) && selectedStats.length >= 3}
                onchange={(e) => {
                  if ((e.target as HTMLInputElement).checked) {
                    if (selectedStats.length < 3) selectedStats = [...selectedStats, s.id];
                  } else {
                    selectedStats = selectedStats.filter(x => x !== s.id);
                  }
                  localStorage.setItem(STATS_KEY, JSON.stringify(selectedStats));
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
  .chrono-nexus { background: #020a04; border: 1px solid #0f3; border-radius: 6px; padding: 12px; position: relative; overflow: hidden; }
  .chrono-nexus::after { content: ''; position: absolute; top: 0; left: -60%; width: 50%; height: 100%; background: linear-gradient(90deg, transparent, rgba(0,255,68,0.03), transparent); animation: scan 5s linear infinite; pointer-events: none; }
  @keyframes scan { to { left: 130%; } }
  .widget-header { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
  .label { font-family: 'Share Tech Mono', monospace; font-size: 9px; letter-spacing: 3px; color: #0f3; }
  .blink-dot { width: 6px; height: 6px; border-radius: 50%; background: #0f3; box-shadow: 0 0 8px #0f3; animation: blink 1.2s ease infinite; flex-shrink: 0; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
  .content { display: flex; gap: 14px; align-items: center; }
  .clock-svg { width: 110px; height: 110px; flex-shrink: 0; }
  .stats-col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .stat { display: flex; flex-direction: column; gap: 3px; }
  .stat-label { font-family: 'Share Tech Mono', monospace; font-size: 8px; letter-spacing: 2px; color: #0a4; }
  .stat-bar { height: 3px; background: #041a08; border-radius: 2px; overflow: hidden; }
  .stat-fill { height: 100%; background: #0f3; box-shadow: 0 0 6px #0f3; border-radius: 2px; transition: width 1.5s cubic-bezier(0.4, 0, 0.2, 1); }
  .stat-val { font-family: 'Share Tech Mono', monospace; font-size: 13px; color: #0f3; }
  .stat-denom { font-size: 10px; color: #0a4; }
  .stat-settings-btn { font-size: 9px; color: #0a4; background: none; border: none; cursor: pointer; margin-top: 2px; padding: 2px; opacity: 0.6; transition: opacity 0.15s; font-family: 'Share Tech Mono', monospace; }
  .stat-settings-btn:hover { opacity: 1; }
  .stat-picker { background: #020a04; border: 1px solid #0a3; border-radius: 6px; padding: 8px; margin-top: 4px; position: absolute; right: 12px; z-index: 10; min-width: 130px; }
  .stat-picker-label { font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0a4; letter-spacing: 2px; margin-bottom: 4px; margin-top: 0; }
  .stat-picker-row { display: flex; align-items: center; gap: 4px; padding: 2px 0; cursor: pointer; }
  .stat-picker-row input { accent-color: #0f3; }
  .stat-picker-row span { font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #0a4; letter-spacing: 1px; }
</style>
