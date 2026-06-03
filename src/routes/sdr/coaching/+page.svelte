<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import UpgradePrompt from '$lib/components/UpgradePrompt.svelte';

	let data = $state<any>(null);
	let feedbackNotes = $state<any[]>([]);
	let loading = $state(true);
	let generating = $state(false);
	let tier = $state('free');

	onMount(async () => {
		const [coachRes, tierRes, feedbackRes] = await Promise.all([
			apiFetch('/api/rep-profile/coaching'),
			apiFetch('/api/portal/tier'),
			apiFetch('/api/sdr/feedback?limit=10'),
		]);
		if (coachRes.ok) data = await coachRes.json();
		if (tierRes.ok) { const d = await tierRes.json(); tier = d.tier; }
		if (feedbackRes.ok) feedbackNotes = await feedbackRes.json();
		loading = false;
	});

	async function generateSupercut() {
		generating = true;
		await apiFetch('/api/rep-profile/supercut', { method: 'POST' });
		generating = false;
	}

	function fmtDur(s: number) { return `${Math.floor(s/60)}m ${s%60}s`; }
	const trendIcon = (t: string) => t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
	const trendColor = (t: string) => t === 'up' ? 'text-green-400' : t === 'down' ? 'text-red-400' : 'text-[#555]';
</script>

<svelte:head><title>Coaching — LeadOS SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto">

	<!-- Header -->
	<div class="flex items-start justify-between mb-8">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:24px;letter-spacing:-.01em;color:#fff;margin-bottom:4px">Coaching</h2>
			<p class="text-xs text-[#444]">You vs. your personal best — not a leaderboard</p>
		</div>
		<button onclick={generateSupercut} disabled={generating}
			class="rounded-lg border border-purple-800/40 px-3 py-2 text-xs text-purple-400 hover:bg-purple-900/20 disabled:opacity-40 transition-colors shrink-0">
			{generating ? '✦ Mining calls…' : '✦ Update supercut'}
		</button>
	</div>

	{#if loading}
		<div class="space-y-4">{#each [1,2,3] as _}<div class="h-24 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>

	{:else}

		<!-- Manager Feedback — shown regardless of tier if feedback exists -->
		{#if feedbackNotes.length > 0}
			<div class="rounded-xl border border-[#1e2a1e] bg-[#0d150d] p-5 mb-6">
				<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.18em;color:#2d6a1f;margin-bottom:14px">Coach Feedback</p>
				<div class="space-y-4">
					{#each feedbackNotes as note}
						<div class="border-b border-[#111] pb-4 last:border-0 last:pb-0">
							<div class="flex items-center gap-3 mb-2">
								{#if note.rating}
									<div class="flex gap-0.5">
										{#each Array(5) as _, i}
											<span class="text-[11px] {i < note.rating ? 'text-yellow-400' : 'text-[#222]'}">★</span>
										{/each}
									</div>
								{/if}
								{#if note.timestamp_seconds}
									<span class="text-[9px] text-blue-500 font-mono">
										{Math.floor(note.timestamp_seconds / 60)}:{String(note.timestamp_seconds % 60).padStart(2,'0')}
									</span>
								{/if}
								<span class="text-[9px] text-[#333] ml-auto">{note.call?.contact?.name ?? '—'} · {new Date(note.created_at).toLocaleDateString()}</span>
							</div>
							<p class="text-sm text-[#ccc] leading-relaxed">{note.content}</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if tier === 'free'}
			<UpgradePrompt feature="AI Coaching" tier="Pro" description="Get weekly benchmarks comparing your performance to your personal best, trend charts, and specific improvement notes." />

		{:else if !data?.hasData}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-10 text-center">
				<p class="text-3xl mb-4">📞</p>
				<p class="text-white text-sm font-medium mb-2">Make some calls first</p>
				<p class="text-xs text-[#444]">Your AI coaching insights and weekly benchmarks appear after you've logged calls</p>
			</div>

		{:else}

			<!-- This week vs. best week -->
			<div class="grid grid-cols-2 gap-4 mb-6">
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5">
					<div class="flex items-center gap-2 mb-3">
						<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.16em;color:#444">This Week</p>
						<span class="text-sm font-semibold {trendColor(data.trend)}">{trendIcon(data.trend)}</span>
					</div>
					{#if data.thisWeek}
						<div class="grid grid-cols-3 gap-3">
							<div><p class="text-2xl font-bold text-white tabular-nums">{data.thisWeek.calls}</p><p class="text-[10px] text-[#555] mt-0.5">calls</p></div>
							<div><p class="text-2xl font-bold text-blue-400 tabular-nums">{data.thisWeek.connectRate}%</p><p class="text-[10px] text-[#555] mt-0.5">connect</p></div>
							<div><p class="text-2xl font-bold text-yellow-400 tabular-nums">{data.thisWeek.winRate}%</p><p class="text-[10px] text-[#555] mt-0.5">win rate</p></div>
						</div>
					{/if}
				</div>

				{#if data.bestWeek}
					<div class="rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-5">
						<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.16em;color:#854d0e;margin-bottom:4px">Your Best Week</p>
						<p class="text-[10px] text-[#555] mb-3">{data.bestWeek.week}</p>
						<div class="grid grid-cols-3 gap-3">
							<div><p class="text-2xl font-bold text-white tabular-nums">{data.bestWeek.calls}</p><p class="text-[10px] text-[#555] mt-0.5">calls</p></div>
							<div><p class="text-2xl font-bold text-blue-400 tabular-nums">{data.bestWeek.connectRate}%</p><p class="text-[10px] text-[#555] mt-0.5">connect</p></div>
							<div><p class="text-2xl font-bold text-yellow-400 tabular-nums">{data.bestWeek.winRate}%</p><p class="text-[10px] text-[#555] mt-0.5">win rate</p></div>
						</div>
					</div>
				{/if}
			</div>

			<!-- AI Insights -->
			{#if data.insights?.length}
				<div class="rounded-xl border border-[#1e1e2e] bg-[#09091a] p-5 mb-6 space-y-4">
					<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.18em;color:#4a4a8a">AI Coaching Notes</p>
					{#each data.insights as insight}
						<div class="flex gap-3">
							<span class="text-purple-500 mt-0.5 shrink-0 text-xs">✦</span>
							<p class="text-sm text-[#aaa] leading-relaxed">{insight}</p>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Weekly win rate trend (bar chart) -->
			{#if data.weeks?.length > 1}
				{@const maxRate = Math.max(...data.weeks.map((w: any) => w.winRate), 1)}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 mb-6">
					<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.16em;color:#444;margin-bottom:16px">Win Rate by Week</p>
					<div class="flex items-end gap-1.5 h-20">
						{#each data.weeks.slice(-8) as week}
							<div class="flex-1 flex flex-col items-center gap-1">
								<div class="w-full rounded-sm bg-yellow-500/70 transition-all"
									style="height:{Math.max(4, (week.winRate / maxRate) * 72)}px">
								</div>
								<p class="text-[8px] text-[#333] truncate w-full text-center">{week.week?.slice(-5) ?? ''}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Recent week breakdown -->
			{#if data.weeks?.length}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden">
					<div class="px-5 py-4 border-b border-[#1a1a1a]">
						<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.16em;color:#444">Weekly Breakdown</p>
					</div>
					<div class="divide-y divide-[#111]">
						{#each data.weeks.slice(-6).reverse() as week}
							<div class="px-5 py-3 grid grid-cols-5 gap-3 text-xs">
								<p class="text-[#555] truncate">{week.week}</p>
								<p class="text-white tabular-nums text-center">{week.calls} <span class="text-[#333]">dials</span></p>
								<p class="text-blue-400 tabular-nums text-center">{week.connectRate}%</p>
								<p class="text-yellow-400 tabular-nums text-center">{week.winRate}%</p>
								<p class="text-[#444] text-right">{fmtDur(week.avgDuration ?? 0)}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

		{/if}
	{/if}

	<!-- Link to public coaching page -->
	<div class="mt-8 pt-6 border-t border-[#111] text-center">
		<a href="/coaching" target="_blank" rel="noopener noreferrer"
			class="text-[10px] text-[#333] hover:text-white transition-colors">
			Learn how the coaching system works →
		</a>
	</div>

</div>
