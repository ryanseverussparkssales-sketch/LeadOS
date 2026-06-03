<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';

  interface Cell { hour: number; count: number; isCurrent: boolean; }
  let cells = $state<Cell[]>([]);
  let maxCount = $state(1);

  function getColor(count: number, isCurrent: boolean, max: number): string {
    if (isCurrent) return '#0f3';
    if (count === 0) return '#021a08';
    const frac = count / max;
    if (frac < 0.25) return '#0a3018';
    if (frac < 0.6) return '#0a6030';
    return '#0bb844';
  }

  function getGlow(count: number, isCurrent: boolean, max: number): string {
    if (isCurrent) return '0 0 10px #0f3';
    if (count === 0) return 'none';
    const frac = count / max;
    if (frac < 0.25) return 'none';
    if (frac < 0.6) return `0 0 4px #0a6030`;
    return `0 0 8px #0bb844`;
  }

  onMount(async () => {
    const curHour = new Date().getHours();
    const hourCounts = new Array(24).fill(0);
    try {
      const res = await apiFetch('/api/calls?limit=500');
      if (res.ok) {
        const calls: any[] = await res.json();
        const today = new Date().toISOString().slice(0, 10);
        calls
          .filter((c: any) => c.created_at?.slice(0, 10) === today)
          .forEach((c: any) => {
            const h = new Date(c.created_at).getHours();
            if (h >= 0 && h < 24) hourCounts[h]++;
          });
      }
    } catch { /* non-fatal */ }
    maxCount = Math.max(...hourCounts, 1);
    cells = hourCounts.map((count, hour) => ({ hour, count, isCurrent: hour === curHour }));
  });
</script>

<div class="neural-grid">
  <div class="header">
    <span class="blink-dot"></span>
    <span class="label">NEURAL ACTIVITY GRID</span>
    <span class="sub-label">24H CALL DISTRIBUTION</span>
  </div>
  <div class="grid">
    {#each cells as cell (cell.hour)}
      <div class="cell"
        title="{cell.hour}:00 — {cell.count} calls"
        style="background:{getColor(cell.count, cell.isCurrent, maxCount)};box-shadow:{getGlow(cell.count, cell.isCurrent, maxCount)};{cell.isCurrent ? 'animation:cellPulse 1s ease infinite;' : ''}">
      </div>
    {/each}
  </div>
  <div class="axis">
    {#each [0, 6, 12, 18, 23] as h}
      <span>{String(h).padStart(2,'0')}:00</span>
    {/each}
  </div>
  <div class="legend">
    <div class="leg-item"><div class="leg-dot" style="background:#021a08"></div>None</div>
    <div class="leg-item"><div class="leg-dot" style="background:#0a3018"></div>Low</div>
    <div class="leg-item"><div class="leg-dot" style="background:#0a6030"></div>Med</div>
    <div class="leg-item"><div class="leg-dot" style="background:#0bb844;box-shadow:0 0 6px #0bb844"></div>High</div>
    <div class="leg-item"><div class="leg-dot" style="background:#0f3;box-shadow:0 0 10px #0f3;animation:cellPulse 1s ease infinite"></div>Now</div>
  </div>
</div>

<style>
  .neural-grid { background: #020a04; border: 1px solid #0f3; border-radius: 6px; padding: 12px; position: relative; overflow: hidden; }
  .header { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
  .label { font-family: 'Share Tech Mono', monospace; font-size: 9px; letter-spacing: 3px; color: #0f3; flex: 1; }
  .sub-label { font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0a4; letter-spacing: 1px; }
  .blink-dot { width: 6px; height: 6px; border-radius: 50%; background: #0f3; box-shadow: 0 0 8px #0f3; animation: blink 1.2s ease infinite; flex-shrink: 0; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
  @keyframes cellPulse { 0%, 100% { opacity: 1; box-shadow: 0 0 10px #0f3; } 50% { opacity: 0.6; box-shadow: 0 0 4px #0f3; } }
  .grid { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; }
  .cell { height: 20px; border-radius: 2px; transition: background 0.5s ease; cursor: default; }
  .axis { display: flex; justify-content: space-between; margin-top: 4px; font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0a4; }
  .legend { display: flex; gap: 10px; margin-top: 8px; }
  .leg-item { display: flex; align-items: center; gap: 4px; font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0a4; }
  .leg-dot { width: 10px; height: 10px; border-radius: 2px; }
</style>
