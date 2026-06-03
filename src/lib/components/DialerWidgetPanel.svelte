<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';

	interface Props {
		callState: 'idle' | 'calling' | 'connected';
		contactName?: string;
		contactPhone?: string;
	}

	let { callState, contactName = '', contactPhone = '' } = $props();

	// Panel state
	let open = $state(false);
	let activeWidgets = $state<string[]>(['pomodoro', 'callbacks', 'notes']);
	let configuring = $state(false);

	// Auto-open panel when call connects
	$effect(() => {
		if (callState === 'connected') open = true;
	});

	// Notes state (quick call notes)
	let notes = $state('');

	// Mini pomodoro
	let pomSecs = $state(25 * 60);
	let pomRunning = $state(false);
	let pomInterval: ReturnType<typeof setInterval>;
	function togglePom() {
		pomRunning = !pomRunning;
		if (pomRunning) {
			clearInterval(pomInterval); // clear any existing before creating new
			pomInterval = setInterval(() => {
				if (pomSecs > 0) pomSecs--;
				else { pomRunning = false; clearInterval(pomInterval); }
			}, 1000);
		} else {
			clearInterval(pomInterval);
		}
	}
	function resetPom() { clearInterval(pomInterval); pomRunning = false; pomSecs = 25 * 60; }
	function fmtT(s: number) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

	// Quick task
	let taskTitle = $state('');
	let taskDue = $state('');
	let savingTask = $state(false);
	async function saveTask() {
		if (!taskTitle.trim()) return;
		savingTask = true;
		await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title: taskTitle, due_date: taskDue || null, task_type: 'callback', priority: 'high' }) });
		taskTitle = ''; taskDue = ''; savingTask = false;
	}

	// Callbacks
	interface Callback { id: string; title: string; due_date: string; contact: { name: string; phone: string } | null; }
	let callbacks = $state<Callback[]>([]);
	onMount(async () => {
		const r = await apiFetch('/api/tasks?status=pending&task_type=callback&limit=5');
		if (r.ok) callbacks = await r.json();
	});
	onDestroy(() => clearInterval(pomInterval));

	function timeUntil(d: string) {
		const diff = new Date(d).getTime() - Date.now();
		if (diff < 0) return 'OVERDUE';
		const m = Math.floor(diff / 60000);
		if (m < 60) return `${m}m`;
		return `${Math.floor(m / 60)}h ${m % 60}m`;
	}

	const AVAILABLE_WIDGETS = [
		{ id: 'pomodoro', label: 'Focus Timer' },
		{ id: 'callbacks', label: 'Callbacks' },
		{ id: 'notes', label: 'Call Notes' },
		{ id: 'task', label: 'Quick Task' },
	];
</script>

<div class="dialer-panel-wrap" class:open>
	<!-- Toggle tab -->
	<button class="panel-tab" onclick={() => open = !open} class:call-active={callState !== 'idle'}
	aria-label="{open ? 'Close' : 'Open'} tools panel"
	aria-expanded={open}>
		<span class="tab-icon">{open ? '›' : '‹'}</span>
		{#if callState === 'connected'}
			<span class="tab-dot connected"></span>
		{:else if callState === 'calling'}
			<span class="tab-dot calling"></span>
		{/if}
		<span class="tab-label">Tools</span>
	</button>

	<!-- Panel content -->
	<div class="panel-content">
		<!-- Panel header -->
		<div class="panel-header">
			<span class="panel-title">
				{#if callState === 'connected'}
					<span class="status-live">● LIVE</span> {contactName || 'Connected'}
				{:else if callState === 'calling'}
					<span class="status-calling">◉ CALLING...</span>
				{:else}
					Tools
				{/if}
			</span>
			<button class="config-btn" onclick={() => configuring = !configuring} title="Configure">⚙</button>
		</div>

		<!-- Widget config -->
		{#if configuring}
			<div class="config-panel">
				<p class="config-label">Show during calls:</p>
				{#each AVAILABLE_WIDGETS as w}
					<label class="config-row">
						<input type="checkbox"
							checked={activeWidgets.includes(w.id)}
							onchange={(e) => {
								if ((e.target as HTMLInputElement).checked) {
									activeWidgets = [...activeWidgets, w.id];
								} else {
									activeWidgets = activeWidgets.filter(x => x !== w.id);
								}
							}} />
						<span>{w.label}</span>
					</label>
				{/each}
			</div>
		{:else}
			<div class="widgets-list">
				<!-- Focus Timer -->
				{#if activeWidgets.includes('pomodoro')}
					<div class="mini-widget">
						<div class="mini-header">
							<span class="mini-label">Focus Timer</span>
							<span class="mini-time" class:running={pomRunning}>{fmtT(pomSecs)}</span>
						</div>
						<div class="pom-bar">
							<div class="pom-fill" style="width:{((25 * 60 - pomSecs) / (25 * 60)) * 100}%"></div>
						</div>
						<div class="mini-actions">
							<button class="mini-btn" onclick={togglePom}>{pomRunning ? '⏸' : '▶'}</button>
							<button class="mini-btn" onclick={resetPom}>↺</button>
						</div>
					</div>
				{/if}

				<!-- Quick Task -->
				{#if activeWidgets.includes('task')}
					<div class="mini-widget">
						<div class="mini-header"><span class="mini-label">Quick Task</span></div>
						<input bind:value={taskTitle} placeholder="Follow up on..." class="mini-input" onkeydown={(e) => e.key === 'Enter' && saveTask()} />
						<div class="mini-actions" style="margin-top:6px">
							<DatePicker bind:value={taskDue} onchange={(v) => taskDue = v} class="mini-input mini-date" />
							<button class="mini-btn primary" onclick={saveTask} disabled={savingTask || !taskTitle.trim()}>
								{savingTask ? '...' : '+ Add'}
							</button>
						</div>
					</div>
				{/if}

				<!-- Call Notes -->
				{#if activeWidgets.includes('notes')}
					<div class="mini-widget">
						<div class="mini-header"><span class="mini-label">Call Notes</span></div>
						<textarea bind:value={notes} placeholder="Type notes during call..." class="mini-textarea" rows="4"></textarea>
					</div>
				{/if}

				<!-- Callbacks -->
				{#if activeWidgets.includes('callbacks')}
					<div class="mini-widget">
						<div class="mini-header"><span class="mini-label">Upcoming Callbacks</span></div>
						{#if callbacks.length === 0}
							<p class="mini-empty">No callbacks scheduled</p>
						{:else}
							{#each callbacks.slice(0, 4) as cb}
								<div class="callback-row">
									<div class="cb-name">{cb.contact?.name ?? cb.title}</div>
									<div class="cb-time" class:overdue={cb.due_date && new Date(cb.due_date) < new Date()}>
										{cb.due_date ? timeUntil(cb.due_date) : '—'}
									</div>
									{#if cb.contact?.phone}
										<a href="/phone?number={cb.contact.phone}" class="cb-call">📞</a>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
.dialer-panel-wrap {
	position: fixed;
	right: -280px;
	top: 50%;
	transform: translateY(-50%);
	width: 280px;
	max-height: 80vh;
	z-index: 100;
	transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	display: flex;
	align-items: stretch;
}
.dialer-panel-wrap.open { right: 0; }

.panel-tab {
	position: absolute;
	left: -32px;
	top: 50%;
	transform: translateY(-50%);
	width: 32px;
	background: #111;
	border: 1px solid #2a2a2a;
	border-right: none;
	border-radius: 8px 0 0 8px;
	padding: 16px 4px;
	cursor: pointer;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	color: #555;
	transition: border-color 0.2s, background 0.2s;
	font-size: 14px;
}
.panel-tab:hover { background: #1a1a1a; border-color: #444; color: #ccc; }
.panel-tab.call-active { border-color: #4ade80; }
.tab-icon { font-size: 16px; }
.tab-label { font-size: 9px; writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg); letter-spacing: 1px; color: inherit; }
.tab-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.tab-dot.connected { background: #4ade80; box-shadow: 0 0 6px #4ade80; animation: blink 1s ease infinite; }
.tab-dot.calling { background: #facc15; animation: blink 0.5s ease infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

.panel-content {
	flex: 1;
	background: #0d0d0d;
	border: 1px solid #2a2a2a;
	border-radius: 12px 0 0 12px;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	scrollbar-width: none;
}
.panel-header {
	padding: 12px 14px;
	border-bottom: 1px solid #1e1e1e;
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
	position: sticky;
	top: 0;
	background: #0d0d0d;
	z-index: 1;
}
.panel-title { font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; }
.status-live { color: #4ade80; font-size: 10px; font-family: monospace; }
.status-calling { color: #facc15; font-size: 10px; font-family: monospace; animation: blink 0.8s ease infinite; }
.config-btn { font-size: 13px; background: none; border: none; color: #444; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.config-btn:hover { color: #888; background: #1a1a1a; }

.widgets-list { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.mini-widget { background: #111; border: 1px solid #1e1e1e; border-radius: 8px; padding: 10px; }
.mini-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mini-label { font-size: 9px; color: #555; letter-spacing: 2px; text-transform: uppercase; }
.mini-time { font-family: monospace; font-size: 14px; color: #4ade80; }
.mini-time.running { color: #86efac; text-shadow: 0 0 8px #4ade8066; }
.pom-bar { height: 3px; background: #1e1e1e; border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
.pom-fill { height: 100%; background: #4ade80; border-radius: 2px; transition: width 1s linear; }
.mini-actions { display: flex; gap: 6px; align-items: center; }
.mini-btn { font-size: 11px; padding: 4px 10px; border: 1px solid #2a2a2a; background: none; color: #777; border-radius: 4px; cursor: pointer; transition: all 0.15s; }
.mini-btn:hover { border-color: #555; color: #ccc; }
.mini-btn.primary { border-color: #4ade80; color: #4ade80; }
.mini-btn.primary:hover { background: #4ade8020; }
.mini-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mini-input { width: 100%; background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 4px; padding: 5px 8px; font-size: 11px; color: #ccc; outline: none; box-sizing: border-box; }
.mini-input:focus { border-color: #2a2a2a; }
.mini-date { width: auto; flex: 1; }
.mini-textarea { width: 100%; background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 4px; padding: 6px 8px; font-size: 11px; color: #ccc; outline: none; resize: none; font-family: inherit; box-sizing: border-box; }
.mini-empty { font-size: 10px; color: #333; text-align: center; padding: 8px 0; }
.callback-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #111; }
.callback-row:last-child { border-bottom: none; }
.cb-name { flex: 1; font-size: 10px; color: #888; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cb-time { font-size: 9px; font-family: monospace; color: #555; white-space: nowrap; }
.cb-time.overdue { color: #ef4444; animation: blink 1s ease infinite; }
.cb-call { font-size: 12px; text-decoration: none; opacity: 0.6; transition: opacity 0.15s; }
.cb-call:hover { opacity: 1; }
.config-panel { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.config-label { font-size: 9px; color: #444; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
.config-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #777; cursor: pointer; }
.config-row input { accent-color: #4ade80; }
</style>
