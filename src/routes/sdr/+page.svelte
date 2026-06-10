<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import Dialer from '$lib/components/Dialer.svelte';

	// SDR info
	interface SdrInfo { ownerId: string; membershipId: string; role: string; verbal_approved_at?: string | null; }
	let sdrInfo = $state<SdrInfo | null>(null);
	const verbalApproved = $derived(!sdrInfo || !!sdrInfo.verbal_approved_at);

	// Today's stats
	interface TodayStats { calls: number; answered: number; appointments: number; bonusEarned: number; bonusRate: number; }
	let stats = $state<TodayStats>({ calls: 0, answered: 0, appointments: 0, bonusEarned: 0, bonusRate: 50 });
	let loadingStats = $state(true);

	onMount(async () => {
		// Get SDR context
		const sdrRes = await apiFetch('/api/portal/sdr');
		if (sdrRes.ok) sdrInfo = await sdrRes.json();

		// Today's call stats
		const today = new Date().toISOString().split('T')[0];
		const callsRes = await apiFetch(`/api/calls?date=${today}&limit=200`);
		if (callsRes.ok) {
			const data = await callsRes.json();
			const calls = data.calls ?? data ?? [];
			const answered = calls.filter((c: any) => c.outcome === 'answered').length;
			const appointments = calls.filter((c: any) =>
				['appointment_set','demo_scheduled','meeting_confirmed'].includes(c.outcome ?? '')
			).length;
			stats = {
				calls: calls.length,
				answered,
				appointments,
				bonusEarned: appointments * stats.bonusRate,
				bonusRate: stats.bonusRate,
			};
		}
		loadingStats = false;
	});
</script>

<svelte:head><title>SDR Queue — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 overflow-hidden">
	<!-- Stats bar -->
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-6 bg-[#080808]">
		<p class="text-xs text-[#7c7c7c] uppercase tracking-widest shrink-0">Today</p>
		{#if loadingStats}
			<div class="flex gap-6">
				{#each [1,2,3,4] as _}<div class="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse"></div>{/each}
			</div>
		{:else}
			<div class="flex items-center gap-6 text-sm">
				<div class="text-center">
					<p class="text-white font-semibold">{stats.calls}</p>
					<p class="text-[10px] text-[#7c7c7c]">Calls</p>
				</div>
				<div class="text-center">
					<p class="text-[var(--accent)] font-semibold">{stats.answered}</p>
					<p class="text-[10px] text-[#7c7c7c]">Answered</p>
				</div>
				<div class="text-center">
					<p class="text-yellow-400 font-semibold">{stats.appointments}</p>
					<p class="text-[10px] text-[#7c7c7c]">Appointments</p>
				</div>
				<div class="text-center">
					<p class="text-[var(--accent)] font-semibold">${stats.bonusEarned}</p>
					<p class="text-[10px] text-[#7c7c7c]">Bonus earned</p>
				</div>
				{#if stats.appointments > 0}
					<div class="ml-2 rounded-full bg-yellow-900/30 border border-yellow-800/40 px-3 py-1">
						<p class="text-xs text-yellow-400">🔥 {stats.appointments} appt{stats.appointments > 1 ? 's' : ''} today</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Dialer — gated behind verbal approval -->
	<div class="flex-1 overflow-hidden">
		{#if !verbalApproved}
			<!-- Verbal approval pending screen -->
			<div class="flex flex-col items-center justify-center h-full text-center px-8">
				<div class="w-16 h-16 rounded-2xl border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-2xl mx-auto mb-6">📞</div>
				<h3 style="font-family:var(--font-display);font-weight:300;font-size:22px;color:#fff;margin-bottom:8px">
					One quick call first.
				</h3>
				<p class="text-xs text-[#7c7c7c] max-w-sm leading-relaxed mb-6">
					Before you start dialing we do a brief verbal call with our founder — 15 minutes, no pressure. It's how we make sure every rep we send to clients is ready to represent them well.
				</p>
				<div class="rounded-xl border border-[#1a1a1a] bg-[#080808] px-6 py-4 max-w-sm text-left space-y-2 mb-6">
					<p class="text-xs text-[#7c7c7c]">What the call covers:</p>
					{#each ['Your sales background & style','The campaigns you\'ll be working','How recordings & coaching work','Q&A — ask anything'] as item}
						<div class="flex items-center gap-2">
							<div class="w-1 h-1 rounded-full bg-[#333] shrink-0"></div>
							<span class="text-[11px] text-[#6e6e6e]">{item}</span>
						</div>
					{/each}
				</div>
				<a href="mailto:ryanseverussparkssales@gmail.com?subject=Verbal call request&body=Hi Ryan, I'd like to schedule my intro call to start dialing."
					class="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
					Request your call →
				</a>
				<p class="text-[10px] text-[#333] mt-4">Usually same-day · reply within a few hours</p>
			</div>
		{:else}
			<Dialer />
		{/if}
	</div>
</div>
