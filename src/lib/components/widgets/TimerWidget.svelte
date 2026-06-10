<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';

	const STORAGE_KEY = 'rogueos_timer';

	interface TimerState {
		running: boolean;
		startedAt: number | null;  // ms timestamp
		pausedElapsed: number;      // ms accumulated before current run
		projectId: string;
		projectName: string;
		campaignId: string;
		campaignName: string;
		description: string;
	}

	const defaultState: TimerState = {
		running: false, startedAt: null, pausedElapsed: 0,
		projectId: '', projectName: '', campaignId: '', campaignName: '', description: ''
	};

	let timerState = $state<TimerState>({ ...defaultState });
	let elapsed = $state(0); // ms
	let ticker: ReturnType<typeof setInterval> | null = null;
	let saving = $state(false);
	let saved = $state(false);

	let projects = $state<{id:string;name:string}[]>([]);
	let campaigns = $state<{id:string;name:string}[]>([]);

	onMount(async () => {
		// Restore timer from localStorage
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			timerState = JSON.parse(stored);
			elapsed = computeElapsed();
		}
		if (timerState.running) startTicker();

		const [pr, camr] = await Promise.all([apiFetch('/api/projects'), apiFetch('/api/campaigns')]);
		projects  = pr.ok ? await pr.json() : [];
		campaigns = camr.ok ? await camr.json() : [];
	});

	onDestroy(() => { if (ticker) clearInterval(ticker); });

	function computeElapsed(): number {
		const now = Date.now();
		const currentRun = timerState.startedAt ? now - timerState.startedAt : 0;
		return timerState.pausedElapsed + currentRun;
	}

	function save() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
	}

	function startTicker() {
		if (ticker) clearInterval(ticker);
		ticker = setInterval(() => { elapsed = computeElapsed(); }, 1000);
	}

	function start() {
		timerState = { ...timerState, running: true, startedAt: Date.now() };
		elapsed = computeElapsed();
		save();
		startTicker();
	}

	function pause() {
		if (!timerState.running) return;
		timerState = {
			...timerState,
			running: false,
			pausedElapsed: computeElapsed(),
			startedAt: null,
		};
		elapsed = timerState.pausedElapsed;
		if (ticker) { clearInterval(ticker); ticker = null; }
		save();
	}

	async function stop() {
		pause();
		const totalMins = Math.max(1, Math.round(timerState.pausedElapsed / 60000));
		saving = true;
		await apiFetch('/api/time-entries', {
			method: 'POST',
			body: JSON.stringify({
				projectId: timerState.projectId || undefined,
				campaignId: timerState.campaignId || undefined,
				description: timerState.description || `Timer session`,
				durationMinutes: totalMins,
				billable: true,
			}),
		});
		saving = false;
		saved = true;
		timerState = { ...defaultState };
		elapsed = 0;
		save();
		setTimeout(() => { saved = false; }, 2000);
	}

	function reset() {
		if (ticker) { clearInterval(ticker); ticker = null; }
		timerState = { ...defaultState };
		elapsed = 0;
		save();
	}

	function fmtElapsed(ms: number) {
		const s = Math.floor(ms / 1000);
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
	}
</script>

<div class="h-full flex flex-col gap-3">
	<!-- Timer display -->
	<div class="text-center">
		<p class="text-4xl font-semibold text-white" style="font-family: var(--font-mono)">
			{fmtElapsed(elapsed)}
		</p>
		{#if timerState.running}
			<p class="text-xs text-[var(--accent)] mt-1 animate-pulse">● Running</p>
		{:else if elapsed > 0}
			<p class="text-xs text-yellow-400 mt-1">◼ Paused</p>
		{:else}
			<p class="text-xs text-[#7c7c7c] mt-1">Ready to start</p>
		{/if}
	</div>

	<!-- Project + campaign selectors (only when not running) -->
	{#if !timerState.running}
		<div class="space-y-2">
			<select
				value={timerState.projectId}
				onchange={(e) => {
					const sel = projects.find(p => p.id === (e.target as HTMLSelectElement).value);
					timerState = { ...timerState, projectId: sel?.id ?? '', projectName: sel?.name ?? '' };
				}}
				class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
				<option value="">No project</option>
				{#each projects as p}<option value={p.id}>{p.name}</option>{/each}
			</select>
			<select
				value={timerState.campaignId}
				onchange={(e) => {
					const sel = campaigns.find(c => c.id === (e.target as HTMLSelectElement).value);
					timerState = { ...timerState, campaignId: sel?.id ?? '', campaignName: sel?.name ?? '' };
				}}
				class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
				<option value="">No campaign</option>
				{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
			</select>
			<input bind:value={timerState.description} placeholder="Description (optional)"
				class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
		</div>
	{:else}
		<!-- Show context while running -->
		<div class="text-center space-y-0.5">
			{#if timerState.projectName}<p class="text-xs text-[#9a9a9a]">{timerState.projectName}</p>{/if}
			{#if timerState.description}<p class="text-xs text-[#7c7c7c]">{timerState.description}</p>{/if}
		</div>
	{/if}

	<!-- Controls -->
	<div class="flex gap-2 mt-auto">
		{#if saved}
			<div class="flex-1 rounded-lg bg-[var(--accent)] py-2 text-center text-xs text-[var(--accent-ink)]">✓ Logged!</div>
		{:else if !timerState.running && elapsed === 0}
			<button onclick={start}
				class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				Start Timer
			</button>
		{:else if timerState.running}
			<button onclick={pause}
				class="flex-1 rounded-lg border border-yellow-600 py-2 text-xs text-yellow-400 hover:bg-yellow-950/30 transition-colors">
				Pause
			</button>
			<button onclick={stop} disabled={saving}
				class="flex-1 rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hi)] disabled:opacity-50 transition-colors">
				{saving ? 'Saving...' : 'Stop & Log'}
			</button>
		{:else}
			<button onclick={start}
				class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				Resume
			</button>
			<button onclick={stop} disabled={saving}
				class="flex-1 rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hi)] disabled:opacity-50 transition-colors">
				{saving ? 'Saving...' : 'Log & Reset'}
			</button>
			<button onclick={reset} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#7c7c7c] hover:text-white transition-colors"><Icon name="x" size={14} /></button>
		{/if}
	</div>
</div>
