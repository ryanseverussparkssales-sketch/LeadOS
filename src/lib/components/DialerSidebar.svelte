<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TimerPomodoro from './widgets/TimerPomodoro.svelte';
	import TimerSprint from './widgets/TimerSprint.svelte';
	import TimerCallbacks from './widgets/TimerCallbacks.svelte';
	import ProjectTimer from './widgets/ProjectTimer.svelte';
	import SpotifyMini from './widgets/SpotifyMini.svelte';
	import ScriptPanel from '$lib/components/widgets/ScriptPanel.svelte';

	let { side, campaignId = '' }: { side: 'left' | 'right'; campaignId?: string } = $props();

	const STORAGE_KEY = `rogueos_dialer_sidebar_${side}`;

	const AVAILABLE = [
		{ id: 'script',       label: 'Call Script',        desc: 'View scripts during calls' },
		{ id: 'pomodoro',     label: 'Focus Timer',       desc: 'Pomodoro' },
		{ id: 'sprint',       label: 'Sprint Timer',      desc: 'X calls in Y min' },
		{ id: 'callbacks',    label: 'Callback Queue',    desc: 'Upcoming callbacks' },
		{ id: 'project',      label: 'Project Timer',     desc: 'Track time' },
		{ id: 'spotify',      label: 'Spotify Mini',      desc: 'Now playing' },
	];

	let activeWidgets = $state<string[]>([]);
	let showPicker = $state(false);
	let collapsed = $state(false);

	onMount(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			activeWidgets = stored ? JSON.parse(stored) : (side === 'left' ? ['script', 'callbacks'] : ['callbacks', 'spotify']);
		} catch {
			activeWidgets = side === 'left' ? ['script', 'callbacks'] : ['callbacks', 'spotify'];
			localStorage.removeItem(STORAGE_KEY); // clear corrupt data
		}
	});

	function toggle(id: string) {
		if (activeWidgets.includes(id)) {
			activeWidgets = activeWidgets.filter(x => x !== id);
		} else {
			activeWidgets = [...activeWidgets, id];
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWidgets));
	}

	function moveUp(id: string) {
		const idx = activeWidgets.indexOf(id);
		if (idx <= 0) return;
		const a = [...activeWidgets];
		[a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
		activeWidgets = a;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWidgets));
	}

	function moveDown(id: string) {
		const idx = activeWidgets.indexOf(id);
		if (idx === -1 || idx >= activeWidgets.length - 1) return;
		const a = [...activeWidgets];
		[a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
		activeWidgets = a;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWidgets));
	}
</script>

<div class="dialer-sidebar" class:collapsed>
	<!-- Header -->
	<div class="sidebar-hdr">
		{#if !collapsed}
			<span class="sidebar-label">{side === 'left' ? '◀ Left Panel' : 'Right Panel ▶'}</span>
			<div class="sidebar-actions">
				<button class="icon-btn" onclick={() => showPicker = !showPicker} title="Add/remove widgets">
					{showPicker ? '✕' : '+'}
				</button>
				<button class="icon-btn" onclick={() => collapsed = true} title="Collapse">‹</button>
			</div>
		{:else}
			<button class="expand-btn" onclick={() => collapsed = false}>
				{side === 'left' ? '›' : '‹'}
			</button>
		{/if}
	</div>

	{#if !collapsed}
		<!-- Widget picker -->
		{#if showPicker}
			<div class="picker">
				{#each AVAILABLE as w}
					<label class="picker-row">
						<input type="checkbox"
							checked={activeWidgets.includes(w.id)}
							onchange={() => toggle(w.id)} />
						<span class="picker-label">{w.label}</span>
						<span class="picker-desc">{w.desc}</span>
					</label>
				{/each}
			</div>
		{:else}
			<!-- Widget list -->
			<div class="widget-list">
				{#if activeWidgets.length === 0}
					<div class="empty-state">
						<p>No widgets</p>
						<button onclick={() => showPicker = true}>+ Add</button>
					</div>
				{/if}
				{#each activeWidgets as wid (wid)}
					<div class="widget-slot group">
						<div class="widget-move-btns">
							<button onclick={() => moveUp(wid)} class="move-btn">↑</button>
							<button onclick={() => moveDown(wid)} class="move-btn">↓</button>
							<button onclick={() => toggle(wid)} class="remove-btn"><Icon name="x" size={14} /></button>
						</div>
						{#if wid === 'script'}
							<ScriptPanel campaignId={campaignId ?? undefined} />
						{:else if wid === 'pomodoro'}
							<TimerPomodoro />
						{:else if wid === 'sprint'}
							<TimerSprint />
						{:else if wid === 'callbacks'}
							<TimerCallbacks />
						{:else if wid === 'project'}
							<ProjectTimer />
						{:else if wid === 'spotify'}
							<SpotifyMini />
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
.dialer-sidebar {
	width: 280px;
	min-width: 280px;
	display: flex;
	flex-direction: column;
	border-right: 1px solid #1e1e1e;
	background: #0a0a0a;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: none;
	transition: width 0.2s ease, min-width 0.2s ease;
	flex-shrink: 0;
}
.dialer-sidebar:last-child {
	border-right: none;
	border-left: 1px solid #1e1e1e;
}
.dialer-sidebar.collapsed {
	width: 32px;
	min-width: 32px;
}
.sidebar-hdr {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 10px;
	border-bottom: 1px solid #1a1a1a;
	flex-shrink: 0;
	position: sticky;
	top: 0;
	background: #0a0a0a;
	z-index: 10;
}
.sidebar-label {
	font-size: 9px;
	letter-spacing: 2px;
	color: #333;
	text-transform: uppercase;
}
.sidebar-actions {
	display: flex;
	gap: 4px;
}
.icon-btn {
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 12px;
	color: #444;
	background: none;
	border: none;
	cursor: pointer;
	border-radius: 3px;
	transition: color 0.15s, background 0.15s;
}
.icon-btn:hover { color: #ccc; background: #1a1a1a; }
.expand-btn {
	width: 100%;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 14px;
	color: #333;
	background: none;
	border: none;
	cursor: pointer;
	transition: color 0.15s;
}
.expand-btn:hover { color: #888; }
.picker {
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 2px;
	border-bottom: 1px solid #1a1a1a;
}
.picker-row {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 5px 6px;
	border-radius: 4px;
	cursor: pointer;
	transition: background 0.1s;
}
.picker-row:hover { background: #111; }
.picker-row input { accent-color: #4ade80; flex-shrink: 0; }
.picker-label { font-size: 11px; color: #888; flex: 1; }
.picker-desc { font-size: 9px; color: #333; }
.widget-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px;
	flex: 1;
}
.widget-slot {
	position: relative;
}
.widget-move-btns {
	position: absolute;
	top: 4px;
	right: 4px;
	z-index: 20;
	display: none;
	gap: 2px;
	background: #0a0a0a;
	border: 1px solid #1e1e1e;
	border-radius: 4px;
	padding: 2px;
}
.widget-slot:hover .widget-move-btns { display: flex; }
.move-btn, .remove-btn {
	font-size: 10px;
	padding: 2px 4px;
	background: none;
	border: none;
	cursor: pointer;
	border-radius: 2px;
	color: #555;
	transition: color 0.1s, background 0.1s;
}
.move-btn:hover { color: #ccc; background: #1a1a1a; }
.remove-btn:hover { color: #ef4444; background: #1a0000; }
.empty-state {
	text-align: center;
	padding: 24px 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
}
.empty-state p { font-size: 11px; color: #333; }
.empty-state button {
	font-size: 11px;
	color: #555;
	background: none;
	border: 1px solid #2a2a2a;
	padding: 4px 12px;
	border-radius: 4px;
	cursor: pointer;
	transition: all 0.15s;
}
.empty-state button:hover { color: #ccc; border-color: #555; }
</style>
