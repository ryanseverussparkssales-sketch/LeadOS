<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { getSession } from '$lib/services/auth';

	interface Campaign { id: string; name: string; status: string; project: { name: string; client: { name: string } }; call_lists: { id: string; name: string }[]; }
	interface Script { id: string; title: string; opener: string | null; client: { name: string } | null; }
	interface Engagement { base_fee: number; bonus_rate: number; }

	let userName = $state('');
	let campaigns = $state<Campaign[]>([]);
	let scripts = $state<Script[]>([]);
	let engagement = $state<Engagement | null>(null);
	let profile = $state<any>(null);
	let loading = $state(true);

	// Checklist state
	let checks = $state({
		hasCampaign: false,
		hasScript: false,
		hasInterview: false,
		hasMadeCalls: false,
	});

	let verbalApproved = $state(false);

	onMount(async () => {
		const session = await getSession();
		userName = session?.user.email?.split('@')[0] ?? 'there';

		const [campRes, scriptRes, profileRes, engRes, sdrRes] = await Promise.all([
			apiFetch('/api/campaigns'),
			apiFetch('/api/scripts'),
			apiFetch('/api/rep-profile'),
			apiFetch('/api/engagements'),
			apiFetch('/api/portal/sdr'),
		]);

		if (sdrRes.ok) {
			const sdr = await sdrRes.json();
			verbalApproved = !!sdr.verbal_approved_at;
		}

		if (campRes.ok) campaigns = (await campRes.json()).filter((c: Campaign) => c.status === 'active');
		if (scriptRes.ok) scripts = await scriptRes.json();
		if (profileRes.ok) profile = await profileRes.json();
		if (engRes.ok) {
			const engs = await engRes.json();
			if (engs.length > 0) engagement = engs[0];
		}

		// Check call history
		const callsRes = await apiFetch('/api/calls?limit=1');
		const hasCalls = callsRes.ok && (await callsRes.json()).length > 0;

		checks = {
			hasCampaign: campaigns.length > 0,
			hasScript: scripts.length > 0,
			hasInterview: profile?.interview_score !== null && profile?.interview_score !== undefined,
			hasMadeCalls: hasCalls,
		};

		loading = false;
	});

	const completedCount = $derived(Object.values(checks).filter(Boolean).length);
	const totalChecks = 4;
</script>

<svelte:head><title>Getting Started — Edelhaus SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto">

	<!-- Welcome header -->
	<div class="mb-8">
		<h1 class="text-2xl font-semibold text-white mb-1">Welcome, {userName} 👋</h1>
		<p class="text-sm text-[#7c7c7c]">Here's everything you need to start dialing and earning.</p>
	</div>

	<!-- Progress bar -->
	<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 mb-6 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
		<div class="flex items-center justify-between mb-2">
			<p class="text-xs text-[#7c7c7c] uppercase tracking-widest">Setup progress</p>
			<p class="text-xs text-white">{completedCount}/{totalChecks} done</p>
		</div>
		<div class="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
			<div class="h-full bg-[var(--accent)] rounded-full transition-all" style="width:{(completedCount/totalChecks)*100}%"></div>
		</div>
		{#if completedCount === totalChecks}
			<p class="text-xs text-[var(--accent)] mt-2">✓ You're all set — start dialing!</p>
		{/if}
	</div>

	{#if loading}
		<div class="space-y-3">{#each [1,2,3,4] as _}<div class="h-20 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>
	{:else}
		<div class="space-y-4">

			<!-- Step 0: Verbal call -->
			<div class="rounded-xl border {verbalApproved ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12' : 'border-yellow-900/30 bg-yellow-950/10'} p-5">
				<div class="flex items-start gap-4">
					<div class="w-8 h-8 rounded-full {verbalApproved ? 'bg-[var(--accent)]' : 'bg-yellow-900/40 border border-yellow-800/40'} flex items-center justify-center text-sm shrink-0 mt-0.5">
						{verbalApproved ? '✓' : '0'}
					</div>
					<div class="flex-1">
						<p class="text-sm text-white font-medium mb-1">Verbal intro call with Ryan</p>
						{#if verbalApproved}
							<p class="text-xs text-[var(--accent)]">✓ Approved — you're cleared to dial live campaigns</p>
						{:else}
							<p class="text-xs text-[#8a8a8a] mb-3">Before your first live dial we do a quick 15-minute call. You talk, Ryan listens. If it's a fit you're in the same day.</p>
							<a href="mailto:ryanseverussparkssales@gmail.com?subject=Verbal call request — Edelhaus&body=Hi Ryan, I'd like to schedule my intro call."
								class="inline-block rounded-lg border border-yellow-800/40 bg-yellow-950/10 px-4 py-2 text-xs text-yellow-400 hover:bg-yellow-950/20 transition-colors">
								Request your call →
							</a>
						{/if}
					</div>
				</div>
			</div>

			<!-- Step 1: Campaign -->
			<div class="rounded-xl border {checks.hasCampaign ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12' : 'border-[#2a2a2a] bg-[#111]'} p-5">
				<div class="flex items-start gap-4">
					<div class="w-8 h-8 rounded-full {checks.hasCampaign ? 'bg-[var(--accent)]' : 'bg-[#1a1a1a] border border-[#2a2a2a]'} flex items-center justify-center text-sm shrink-0 mt-0.5">
						{checks.hasCampaign ? '✓' : '1'}
					</div>
					<div class="flex-1">
						<p class="text-sm text-white font-medium mb-1">Your active campaigns</p>
						{#if campaigns.length === 0}
							<p class="text-xs text-[#7c7c7c]">No active campaigns assigned yet. Your manager will assign you to a campaign.</p>
							<p class="text-xs text-[#333] mt-1">Once assigned, your call queue will populate automatically.</p>
						{:else}
							<div class="space-y-2 mt-2">
								{#each campaigns as c}
									<div class="flex items-center gap-3 rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2">
										<div class="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0"></div>
										<div class="flex-1 min-w-0">
											<p class="text-xs text-white font-medium truncate">{c.name}</p>
											<p class="text-[10px] text-[#6e6e6e]">{c.project?.client?.name} · {c.project?.name}</p>
										</div>
										<a href="/sdr?listId={c.call_lists?.[0]?.id ?? ''}" class="text-[10px] text-[var(--accent)] hover:text-[var(--accent-hi)] transition-colors shrink-0">Start dialing →</a>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Step 2: Script -->
			<div class="rounded-xl border {checks.hasScript ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12' : 'border-[#2a2a2a] bg-[#111]'} p-5">
				<div class="flex items-start gap-4">
					<div class="w-8 h-8 rounded-full {checks.hasScript ? 'bg-[var(--accent)]' : 'bg-[#1a1a1a] border border-[#2a2a2a]'} flex items-center justify-center text-sm shrink-0 mt-0.5">
						{checks.hasScript ? '✓' : '2'}
					</div>
					<div class="flex-1">
						<p class="text-sm text-white font-medium mb-1">Your call scripts</p>
						{#if scripts.length === 0}
							<p class="text-xs text-[#7c7c7c]">No scripts assigned yet. Your manager will add scripts to your campaigns.</p>
						{:else}
							<div class="space-y-1.5 mt-2">
								{#each scripts.slice(0,3) as s}
									<a href="/sdr/scripts" class="flex items-center gap-2 rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2 hover:border-[#2a2a2a] transition-colors">
										<span class="text-sm">📝</span>
										<div class="flex-1 min-w-0">
											<p class="text-xs text-white truncate">{s.title}</p>
											{#if s.client}<p class="text-[10px] text-[#6e6e6e]">{s.client.name}</p>{/if}
										</div>
										<span class="text-[10px] text-[#6e6e6e]">→</span>
									</a>
								{/each}
								{#if scripts.length > 3}<p class="text-[10px] text-[#6e6e6e] mt-1">+{scripts.length - 3} more in <a href="/sdr/scripts" class="underline hover:text-white">Scripts</a></p>{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Step 3: How bonuses work -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div class="flex items-start gap-4">
					<div class="w-8 h-8 rounded-full bg-yellow-900/30 border border-yellow-800/40 flex items-center justify-center text-sm shrink-0 mt-0.5">💰</div>
					<div class="flex-1">
						<p class="text-sm text-white font-medium mb-1">How your pay works</p>
						{#if engagement}
							<div class="grid grid-cols-2 gap-3 mt-2">
								<div class="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2.5">
									<p class="text-lg font-semibold text-white">${engagement.base_fee.toLocaleString()}<span class="text-[#6e6e6e] text-xs font-normal">/mo</span></p>
									<p class="text-[10px] text-[#7c7c7c]">Base retainer</p>
								</div>
								<div class="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2.5">
									<p class="text-lg font-semibold text-yellow-400">+${engagement.bonus_rate}<span class="text-[#6e6e6e] text-xs font-normal"> per appt</span></p>
									<p class="text-[10px] text-[#7c7c7c]">Appointment bonus</p>
								</div>
							</div>
							<p class="text-[10px] text-[#333] mt-2">Set 10 appointments = ${engagement.base_fee + engagement.bonus_rate * 10}/mo · Set 20 = ${engagement.base_fee + engagement.bonus_rate * 20}/mo</p>
						{:else}
							<p class="text-xs text-[#7c7c7c]">Base retainer + $50 per qualified appointment set. Your exact rates will be set by your manager.</p>
							<p class="text-xs text-[#6e6e6e] mt-1">View your rates in <a href="/sdr/performance" class="underline hover:text-white">Performance</a> once assigned.</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Step 4: AI Interview -->
			<div class="rounded-xl border {checks.hasInterview ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12' : 'border-[#2a2a2a] bg-[#111]'} p-5">
				<div class="flex items-start gap-4">
					<div class="w-8 h-8 rounded-full {checks.hasInterview ? 'bg-[var(--accent)]' : 'bg-[#1a1a1a] border border-[#2a2a2a]'} flex items-center justify-center text-sm shrink-0 mt-0.5">
						{checks.hasInterview ? '✓' : '3'}
					</div>
					<div class="flex-1">
						<p class="text-sm text-white font-medium mb-1">AI Interview — get certified</p>
						{#if checks.hasInterview}
							<p class="text-xs text-[var(--accent)]">Score: {profile?.interview_score}/100 {profile?.interview_score >= 70 ? '· Live Roleplay unlocked ✓' : '· Score ≥70 to unlock Live Roleplay'}</p>
						{:else}
							<p class="text-xs text-[#7c7c7c] mb-3">Answer 5 sales questions to get an AI score. Score ≥70 unlocks Live Roleplay certification.</p>
							<a href="/sdr/interview" class="inline-block rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-4 py-2 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] transition-colors">
								Start AI Interview →
							</a>
						{/if}
					</div>
				</div>
			</div>

			<!-- Ready to dial -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 flex items-center justify-between hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div>
					<p class="text-sm text-white font-medium">Ready to start dialing?</p>
					<p class="text-xs text-[#7c7c7c] mt-0.5">Your queue loads automatically from your assigned campaigns.</p>
				</div>
				<a href="/sdr" class="rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors whitespace-nowrap">
					📞 Open Dialer
				</a>
		</div>
	</div>
	{/if}
	</div>
