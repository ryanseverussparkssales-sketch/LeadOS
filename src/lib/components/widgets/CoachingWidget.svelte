<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface CoachingData {
		available: boolean;
		reason?: string;
		callCount?: number;
		avgScore?: number;
		trend?: number;
		metrics?: {
			avgTalkRatio: number;
			avgDiscoveryQ: number;
			objHandleRate: number;
			winRate: number;
		};
		coaching?: {
			weeklyScore: number;
			headline: string;
			topStrength: string;
			topImprovement: string;
			focusDrill: string;
			callTargets: {
				talkRatioTarget: number;
				discoveryQTarget: number;
				scoreTarget: number;
			};
			momentum: 'rising' | 'steady' | 'dropping';
		};
		generatedAt?: string;
	}

	let coaching = $state<CoachingData | null>(null);
	let loading = $state(true);
	let error = $state('');

	onMount(loadCoaching);

	async function loadCoaching() {
		loading = true;
		error = '';
		try {
			const r = await apiFetch('/api/reps/me/coaching');
			if (r.ok) {
				coaching = await r.json();
			} else {
				error = 'Failed to load coaching data';
			}
		} catch {
			error = 'Network error';
		}
		loading = false;
	}

	function momentumClass(m: string | undefined) {
		if (m === 'rising') return 'bg-[var(--accent)]/12 text-[var(--accent)]';
		if (m === 'dropping') return 'bg-red-950 text-red-400';
		return 'bg-[#1a1a1a] text-[#555]';
	}

	function momentumArrow(m: string | undefined) {
		if (m === 'rising') return '↑';
		if (m === 'dropping') return '↓';
		return '→';
	}

	function trendLabel(t: number) {
		if (t > 3) return `+${t} pts`;
		if (t < -3) return `${t} pts`;
		return 'stable';
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-full">
		<p class="text-[#333] text-xs animate-pulse">Analyzing performance...</p>
	</div>
{:else if error}
	<div class="flex flex-col items-center justify-center h-full gap-2">
		<p class="text-[#444] text-xs">{error}</p>
		<button onclick={loadCoaching} class="text-xs text-[#555] hover:text-white transition-colors underline">Retry</button>
	</div>
{:else if !coaching?.available}
	<div class="flex flex-col items-center justify-center h-full gap-1">
		<p class="text-[#444] text-xs text-center">Coaching unavailable</p>
		<p class="text-[#333] text-xs text-center">{coaching?.reason ?? 'Score more calls to unlock'}</p>
	</div>
{:else if coaching?.coaching}
	{@const c = coaching.coaching}
	{@const m = coaching.metrics}
	<div class="flex flex-col gap-3 h-full overflow-y-auto">
		<!-- Score row -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="font-mono text-white font-bold text-2xl">{coaching.avgScore}</span>
				<span class="text-[10px] text-[#444]">/100</span>
				{#if (coaching.trend ?? 0) !== 0}
					<span class="text-[10px] text-[#555]">{trendLabel(coaching.trend ?? 0)}</span>
				{/if}
			</div>
			<span class="text-xs px-2 py-0.5 rounded-full {momentumClass(c.momentum)}">
				{momentumArrow(c.momentum)} {c.momentum}
			</span>
		</div>

		<!-- Headline -->
		<p class="text-sm text-white font-medium leading-snug">{c.headline}</p>

		<!-- Insights -->
		<div class="space-y-2">
			<div class="flex gap-2">
				<span class="text-[var(--accent)] text-xs flex-shrink-0 mt-0.5">✓</span>
				<p class="text-xs text-[#888] leading-relaxed">{c.topStrength}</p>
			</div>
			<div class="flex gap-2">
				<span class="text-yellow-400 text-xs flex-shrink-0 mt-0.5">▲</span>
				<p class="text-xs text-[#888] leading-relaxed">{c.topImprovement}</p>
			</div>
			<div class="flex gap-2">
				<span class="text-blue-400 text-xs flex-shrink-0 mt-0.5">◉</span>
				<p class="text-xs text-[#888] leading-relaxed">{c.focusDrill}</p>
			</div>
		</div>

		<!-- Metrics bar -->
		{#if m}
			<div class="flex gap-4 pt-3 border-t border-[#1a1a1a] mt-auto">
				<div class="text-center">
					<p class="text-white font-mono text-sm">{m.avgTalkRatio}%</p>
					<p class="text-[10px] text-[#444]">talk ratio</p>
				</div>
				<div class="text-center">
					<p class="text-white font-mono text-sm">{m.avgDiscoveryQ}</p>
					<p class="text-[10px] text-[#444]">questions/call</p>
				</div>
				<div class="text-center">
					<p class="text-white font-mono text-sm">{m.winRate}%</p>
					<p class="text-[10px] text-[#444]">win rate</p>
				</div>
				<div class="text-center">
					<p class="text-white font-mono text-sm">{m.objHandleRate}%</p>
					<p class="text-[10px] text-[#444]">obj. handled</p>
				</div>
			</div>
		{/if}

		<!-- Targets row -->
		{#if c.callTargets}
			<div class="flex gap-3 text-center pt-2 border-t border-[#111]">
				<div class="flex-1 rounded-lg bg-[#0d0d0d] p-2">
					<p class="text-[10px] text-[#444] mb-0.5">Talk target</p>
					<p class="text-white font-mono text-xs">{c.callTargets.talkRatioTarget}%</p>
				</div>
				<div class="flex-1 rounded-lg bg-[#0d0d0d] p-2">
					<p class="text-[10px] text-[#444] mb-0.5">Qs/call target</p>
					<p class="text-white font-mono text-xs">{c.callTargets.discoveryQTarget}</p>
				</div>
				<div class="flex-1 rounded-lg bg-[#0d0d0d] p-2">
					<p class="text-[10px] text-[#444] mb-0.5">Score target</p>
					<p class="text-white font-mono text-xs">{c.callTargets.scoreTarget}</p>
				</div>
			</div>
		{/if}

		<!-- Refresh -->
		<button onclick={loadCoaching}
			class="text-[10px] text-[#333] hover:text-[#666] transition-colors text-center mt-auto">
			Refresh · {coaching.callCount} calls analyzed
		</button>
	</div>
{/if}
