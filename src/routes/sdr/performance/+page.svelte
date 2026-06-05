<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastError } from '$lib/stores/toast';

	// Live rates from engagement record
	let bonusRate = $state(50);
	let monthlyBase = $state(0);

	// Stripe Connect
	let stripeStatus = $state<'not_connected' | 'pending' | 'active'>('not_connected');
	let stripeConnecting = $state(false);
	let myPayouts = $state<any[]>([]);
	let feedbackNotes = $state<any[]>([]);

	interface WeekStats { week: string; calls: number; answered: number; wins: number; connectRate: number; winRate: number; avgDuration: number; }
	let weeks = $state<WeekStats[]>([]);
	let totalThisMonth = $state({ calls: 0, answered: 0, appointments: 0 });
	let loading = $state(true);

	function connectRate(answered: number, calls: number) {
		return calls > 0 ? Math.round((answered / calls) * 100) : 0;
	}
	function apptRate(appts: number, answered: number) {
		return answered > 0 ? Math.round((appts / answered) * 100) : 0;
	}

	async function connectStripe() {
		stripeConnecting = true;
		const res = await apiFetch('/api/stripe/connect-url', { method: 'POST' });
		if (res.ok) {
			const { url } = await res.json();
			window.location.href = url;
		} else {
			toastError('Could not start Stripe connection — try again');
			stripeConnecting = false;
		}
	}

	// Handle Stripe return
	if (typeof window !== 'undefined') {
		const params = new URLSearchParams(window.location.search);
		if (params.get('stripe') === 'connected') stripeStatus = 'pending';
	}

	onMount(async () => {
		const [coachRes, engRes, memberRes, payoutsRes, feedbackRes] = await Promise.all([
			apiFetch('/api/rep-profile/coaching'),
			apiFetch('/api/engagements'),
			apiFetch('/api/portal/permissions'),
			apiFetch('/api/payouts'),
			apiFetch('/api/sdr/feedback?limit=10'),
		]);

		if (memberRes.ok) {
			const d = await memberRes.json();
			stripeStatus = d.stripe_connect_status ?? 'not_connected';
		}
		if (payoutsRes.ok) myPayouts = await payoutsRes.json();
		if (feedbackRes.ok) feedbackNotes = await feedbackRes.json();

		if (coachRes.ok) {
			const d = await coachRes.json();
			if (d.hasData) {
				weeks = d.weeks ?? [];
				// Compute this month's totals from weeks (last 4 weeks)
				const monthWeeks = weeks.slice(-4);
				const totalCalls = monthWeeks.reduce((s, w) => s + w.calls, 0);
				const totalAnswered = monthWeeks.reduce((s, w) => s + w.answered, 0);
				const totalWins = monthWeeks.reduce((s, w) => s + w.wins, 0);
				totalThisMonth = { calls: totalCalls, answered: totalAnswered, appointments: totalWins };
			}
		}

		if (engRes.ok) {
			const engs = await engRes.json();
			if (engs.length > 0) {
				bonusRate = engs[0].bonus_rate ?? 50;
				monthlyBase = engs[0].base_fee ?? 0;
			}
		}

		loading = false;
	});

	const bonusEarned = $derived(totalThisMonth.appointments * bonusRate);
	const totalPay = $derived(monthlyBase + bonusEarned);
</script>

<svelte:head><title>My Performance — RogueOS SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8">
	<h2 class="text-white text-lg font-semibold mb-6">My Performance</h2>

	{#if loading}
		<div class="space-y-4">
			{#each [1,2,3] as _}<div class="h-24 bg-[#111] rounded-xl animate-pulse"></div>{/each}
		</div>
	{:else}
		<!-- Monthly earnings -->
		<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-6 mb-6">
			<p class="text-xs text-[#555] uppercase tracking-widest mb-4">This Month's Earnings</p>
			<div class="grid grid-cols-3 gap-6">
				<div>
					<p class="text-2xl font-semibold text-white">${monthlyBase.toLocaleString()}</p>
					<p class="text-xs text-[#555] mt-1">Base retainer</p>
				</div>
				<div>
					<p class="text-2xl font-semibold text-yellow-400">+${bonusEarned.toLocaleString()}</p>
					<p class="text-xs text-[#555] mt-1">{totalThisMonth.appointments} appts × ${bonusRate}</p>
				</div>
				<div>
					<p class="text-2xl font-semibold text-[var(--accent)]">${totalPay.toLocaleString()}</p>
					<p class="text-xs text-[#555] mt-1">Total earned</p>
				</div>
			</div>
		</div>

		<!-- Activity stats -->
		<div class="grid grid-cols-4 gap-4 mb-6">
			{#each [
				{ label: 'Calls made', value: totalThisMonth.calls, color: 'text-white' },
				{ label: 'Connect rate', value: `${connectRate(totalThisMonth.answered, totalThisMonth.calls)}%`, color: 'text-blue-400' },
				{ label: 'Appointments', value: totalThisMonth.appointments, color: 'text-yellow-400' },
				{ label: 'Appt rate', value: `${apptRate(totalThisMonth.appointments, totalThisMonth.answered)}%`, color: 'text-[var(--accent)]' },
			] as stat}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<p class="text-2xl font-semibold {stat.color}">{stat.value}</p>
					<p class="text-xs text-[#555] mt-1">{stat.label}</p>
				</div>
			{/each}
		</div>

		<!-- Weekly breakdown -->
		{#if weeks.length > 0}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 mb-6 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#555] uppercase tracking-widest mb-4">Weekly Breakdown</p>
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead>
							<tr class="text-[#444] border-b border-[#1a1a1a]">
								<th class="text-left py-2 font-normal">Week</th>
								<th class="text-right py-2 font-normal">Calls</th>
								<th class="text-right py-2 font-normal">Connect%</th>
								<th class="text-right py-2 font-normal">Appts</th>
								<th class="text-right py-2 font-normal">Win%</th>
								<th class="text-right py-2 font-normal">Bonus</th>
							</tr>
						</thead>
						<tbody>
							{#each weeks.slice(-8) as week}
								<tr class="border-b border-[#111] hover:bg-white/3">
									<td class="py-2 text-[#666]">{week.week}</td>
									<td class="py-2 text-right text-white">{week.calls}</td>
									<td class="py-2 text-right text-blue-400">{week.connectRate}%</td>
									<td class="py-2 text-right text-yellow-400">{week.wins}</td>
									<td class="py-2 text-right text-[var(--accent)]">{week.winRate}%</td>
									<td class="py-2 text-right text-[var(--accent)]">${week.wins * bonusRate}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Bonus milestone -->
		{#if totalThisMonth.appointments < 20}
			{@const next = Math.ceil((totalThisMonth.appointments + 1) / 5) * 5}
			{@const pct = Math.min((totalThisMonth.appointments / next) * 100, 100)}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div class="flex items-center justify-between mb-3">
					<p class="text-xs text-[#999]">Next milestone: {next} appointments</p>
					<p class="text-xs text-yellow-400">{totalThisMonth.appointments}/{next}</p>
				</div>
				<div class="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
					<div class="h-full bg-yellow-500 rounded-full transition-all" style="width:{pct}%"></div>
				</div>
				<p class="text-[10px] text-[#444] mt-2">{next - totalThisMonth.appointments} more = +${(next - totalThisMonth.appointments) * bonusRate}</p>
			</div>
		{:else}
			<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-4 text-center">
				<p class="text-[var(--accent)] font-semibold">🏆 Milestone hit! {totalThisMonth.appointments} appointments this month</p>
			</div>
		{/if}
	{/if}

		<!-- Stripe Connect banner -->
		{#if stripeStatus === 'not_connected'}
			<div class="rounded-xl border border-yellow-800/40 bg-yellow-950/10 p-4 mb-4 flex items-center justify-between gap-4">
				<div>
					<p class="text-sm text-white font-medium">Connect Stripe to receive payouts</p>
					<p class="text-xs text-[#666] mt-0.5">Your manager pays per appointment set — connect once and get paid directly.</p>
				</div>
				<button onclick={connectStripe} disabled={stripeConnecting}
					class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 whitespace-nowrap transition-colors shrink-0">
					{stripeConnecting ? 'Redirecting…' : '💳 Connect Stripe'}
				</button>
			</div>
		{:else if stripeStatus === 'pending'}
			<div class="rounded-xl border border-blue-800/40 bg-blue-950/10 p-4 mb-4 flex items-center gap-3">
				<span class="text-blue-400">⏳</span>
				<div>
					<p class="text-sm text-white font-medium">Stripe account pending verification</p>
					<p class="text-xs text-[#555] mt-0.5">Stripe is reviewing your account — payouts will be enabled once approved.</p>
				</div>
			</div>
		{:else}
			<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-3 mb-4 flex items-center gap-2">
				<span class="text-[var(--accent)] text-xs">✓</span>
				<p class="text-xs text-[var(--accent)]">Stripe connected — payouts go directly to your bank</p>
			</div>
		{/if}

		<!-- My payouts -->
		{#if myPayouts.length > 0}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#444] uppercase tracking-widest mb-3">My Payouts</p>
				<div class="space-y-2">
					{#each myPayouts.slice(0,5) as p}
						<div class="flex items-center justify-between text-xs">
							<span class="text-[#888]">{p.call?.contact?.name ?? '—'} · {new Date(p.created_at).toLocaleDateString()}</span>
							<div class="flex items-center gap-2">
								<span class="text-[9px] px-1.5 py-0.5 rounded {p.status === 'paid' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'bg-yellow-900/40 text-yellow-400'}">{p.status}</span>
								<span class="text-white font-semibold">${(p.amount_cents / 100).toFixed(2)}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Manager feedback notes -->
		{#if feedbackNotes.length > 0}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#444] uppercase tracking-widest mb-3">Coach Feedback ({feedbackNotes.length})</p>
				<div class="space-y-3">
					{#each feedbackNotes.slice(0,5) as note}
						<div class="border-b border-[#1a1a1a] pb-3 last:border-0 last:pb-0">
							<div class="flex items-center gap-2 mb-1">
								{#if note.rating}
									<div class="flex gap-0.5">
										{#each Array(5) as _, i}
											<span class="text-[10px] {i < note.rating ? 'text-yellow-400' : 'text-[#333]'}">★</span>
										{/each}
									</div>
								{/if}
								<span class="text-[9px] text-[#444]">{note.call?.contact?.name ?? '—'} · {new Date(note.created_at).toLocaleDateString()}</span>
							</div>
							<p class="text-xs text-[#ccc] leading-relaxed">{note.content}</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
</div>
