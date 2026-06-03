<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';

  interface LogEntry { id: string; ts: string; type: 'call' | 'sms' | 'task' | 'deal' | 'system'; msg: string; }

  let entries = $state<LogEntry[]>([]);
  let container: HTMLElement;
  let pollInterval: ReturnType<typeof setInterval>;
  let seenIds = new Set<string>();

  function fmt(d: string) {
    const dt = new Date(d);
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
  }

  function addEntry(e: LogEntry) {
    if (seenIds.has(e.id)) return;
    seenIds.add(e.id);
    entries = [...entries.slice(-19), e];
    setTimeout(() => { if (container) container.scrollTop = container.scrollHeight; }, 50);
  }

  async function poll() {
    try {
      const [callsRes, tasksRes, smsRes] = await Promise.all([
        apiFetch('/api/calls?limit=10'),
        apiFetch('/api/tasks?limit=10'),
        apiFetch('/api/sms?limit=10'),
      ]);
      if (callsRes.ok) {
        const calls: any[] = await callsRes.json();
        calls.forEach((c: any) => {
          const outcome = c.outcome ?? 'pending';
          addEntry({ id: `call-${c.id}`, ts: fmt(c.created_at), type: 'call',
            msg: `OUTBOUND → ${c.contact?.name ?? c.phone_number ?? 'Unknown'} · ${outcome.toUpperCase()}${c.call_duration_seconds ? ` · ${Math.floor(c.call_duration_seconds/60)}m ${c.call_duration_seconds%60}s` : ''}` });
        });
      }
      if (tasksRes.ok) {
        const tasks: any[] = await tasksRes.json();
        tasks.forEach((t: any) => addEntry({ id: `task-${t.id}`, ts: fmt(t.created_at ?? new Date().toISOString()), type: 'task',
          msg: `TASK · ${t.status?.toUpperCase()} · ${t.title}` }));
      }
      if (smsRes.ok) {
        const smss: any[] = await smsRes.json();
        smss.forEach((s: any) => addEntry({ id: `sms-${s.id}`, ts: fmt(s.sent_at ?? s.created_at), type: 'sms',
          msg: `SMS_${s.direction?.toUpperCase() ?? 'TX'} ${s.direction === 'inbound' ? '←' : '→'} ${s.contact?.name ?? s.to ?? '?'} · "${(s.body ?? '').slice(0, 40)}${s.body?.length > 40 ? '…' : ''}"` }));
      }
    } catch { /* non-fatal */ }
  }

  onMount(() => {
    poll();
    pollInterval = setInterval(poll, 15000);
  });
  onDestroy(() => clearInterval(pollInterval));
</script>

<div class="transmission-log">
  <div class="header">
    <span class="blink-dot"></span>
    <span class="label">TRANSMISSION LOG</span>
    <span class="live-badge">● LIVE</span>
  </div>
  <div class="log-body" bind:this={container}>
    {#if entries.length === 0}
      <div class="empty">AWAITING TRANSMISSION DATA...</div>
    {/if}
    {#each entries as entry (entry.id)}
      <div class="log-line" class:call={entry.type === 'call'} class:sms={entry.type === 'sms'} class:task={entry.type === 'task'}>
        <span class="ts">{entry.ts}</span>
        <span class="type-badge type-{entry.type}">{entry.type.toUpperCase()}</span>
        <span class="msg">{entry.msg}</span>
      </div>
    {/each}
  </div>
  <div class="fade-bottom"></div>
</div>

<style>
  .transmission-log { background: #02050a; border: 1px solid #0f3; border-radius: 6px; padding: 12px; position: relative; overflow: hidden; display: flex; flex-direction: column; }
  .header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .label { font-family: 'Share Tech Mono', monospace; font-size: 9px; letter-spacing: 3px; color: #0f3; flex: 1; }
  .live-badge { font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0a3; letter-spacing: 1px; animation: blink 2s ease infinite; }
  .blink-dot { width: 6px; height: 6px; border-radius: 50%; background: #0f3; box-shadow: 0 0 8px #0f3; animation: blink 1.2s ease infinite; flex-shrink: 0; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
  .log-body { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; scrollbar-width: none; }
  .log-body::-webkit-scrollbar { display: none; }
  .log-line { display: flex; gap: 8px; align-items: baseline; font-family: 'Share Tech Mono', monospace; font-size: 10px; padding: 3px 0; border-bottom: 1px solid #051008; animation: fadeIn 0.4s ease forwards; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .ts { color: #0a3; white-space: nowrap; font-size: 9px; }
  .type-badge { padding: 0px 5px; border-radius: 2px; font-size: 8px; white-space: nowrap; }
  .type-call { background: #071a0c; color: #0f6; border: 1px solid #0f3; }
  .type-sms { background: #00122a; color: #48f; border: 1px solid #26f; }
  .type-task { background: #1a0e00; color: #fb0; border: 1px solid #f80; }
  .type-deal { background: #12003a; color: #c8f; border: 1px solid #90f; }
  .msg { color: #6a8; font-size: 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .empty { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #0a3; padding: 20px 0; text-align: center; animation: blink 2s ease infinite; }
  .fade-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 28px; background: linear-gradient(to top, #02050a, transparent); pointer-events: none; }
</style>
