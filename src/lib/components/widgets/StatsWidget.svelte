<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	let stats = $state<{callCount:number;totals:{total:number;minutes:number};time:{totalMins:number;billableMins:number}} | null>(null);
	let animated = $state(false);

	// Count-up: animates a number from 0 to target over ~600ms
	function useCountUp(target: number, duration = 600) {
		let current = 0;
		const steps = 20;
		const inc = target / steps;
		const interval = setInterval(() => {
			current = Math.min(current + inc, target);
			if (current >= target) clearInterval(interval);
		}, duration / steps);
	}

	// Display value — if numeric, show animated integer; else show as-is
	function displayVal(raw: string) { return raw; } // passthrough; animation is CSS-driven

	onMount(async () => {
		try {
			const res = await apiFetch('/api/analytics?period=today');
			if (res.ok) {
				stats = await res.json();
				// Trigger CSS entry animation after data loads
				requestAnimationFrame(() => { animated = true; });
			}
		} catch (e) {
			console.error('[StatsWidget] fetch error:', e);
		}
	});

	function fmtMins(m: number) {
		const h = Math.floor(m / 60); const min = m % 60;
		return h > 0 ? `${h}h ${min}m` : `${min}m`;
	}
</script>

<div class="grid grid-cols-2 gap-3 h-full content-start">
	{#each [
		{ label: 'Calls Today', value: stats?.callCount?.toString() ?? '—', accent: stats?.callCount ? 'text-white' : 'text-[#444]' },
		{ label: 'API Cost',    value: stats ? `$${stats.totals.total.toFixed(3)}` : '—', accent: 'text-white' },
		{ label: 'Talk Time',   value: stats ? fmtMins(stats.totals.minutes) : '—', accent: stats?.totals.minutes ? 'text-blue-400' : 'text-[#444]' },
		{ label: 'Time Logged', value: stats ? fmtMins(stats.time.totalMins) : '—', accent: 'text-white' },
	] as kpi, i}
		<div class="rounded-lg bg-[var(--c-card,#0f0f0f)] border border-[var(--c-border,#1a1a1a)] p-3 {animated ? 'stat-value-animate' : 'opacity-0'}"
			style="animation-delay:{i * 80}ms">
			<p class="text-[10px] text-[#444] uppercase tracking-wider mb-2" style="font-family:var(--font-label,'Cormorant SC',serif);letter-spacing:.16em">{kpi.label}</p>
			<p class="text-xl font-semibold {kpi.accent} tabular-nums" style="letter-spacing:-.02em">{kpi.value}</p>
		</div>
	{/each}
</div>
