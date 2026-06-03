<script lang="ts">
	import { onMount } from 'svelte';

	const SPECIALTIES: Record<string,string> = {
		saas:'SaaS', ecommerce:'E-Commerce', b2b:'B2B', creator:'Creator Economy',
		healthcare:'Healthcare', fintech:'Fintech', real_estate:'Real Estate',
		insurance:'Insurance', recruiting:'Recruiting', solar:'Solar & Energy',
		staffing:'Staffing', media:'Media & Advertising',
	};

	interface Rep {
		username: string; display_name: string | null; bio: string | null;
		location: string | null; specialties: string[]; hourly_rate: number | null;
		availability: string; interview_score: number | null; roleplay_unlocked: boolean;
		stats?: { totalCalls: number; overallConnectRate: number; overallWinRate: number };
	}

	let reps = $state<Rep[]>([]);
	let loading = $state(true);
	let filterSpecialty = $state('');
	let filterAvail = $state('available');
	let search = $state('');

	onMount(async () => {
		const r = await fetch('/api/rep-profile/list');
		if (r.ok) reps = await r.json();
		loading = false;
	});

	const filtered = $derived(reps.filter(r => {
		if (filterAvail && r.availability !== filterAvail && filterAvail !== 'all') return false;
		if (filterSpecialty && !r.specialties?.includes(filterSpecialty)) return false;
		if (search) {
			const s = search.toLowerCase();
			if (!r.display_name?.toLowerCase().includes(s) &&
				!r.bio?.toLowerCase().includes(s) &&
				!r.location?.toLowerCase().includes(s)) return false;
		}
		return true;
	}));

	function scoreColor(s: number) {
		return s >= 85 ? 'text-green-400' : s >= 70 ? 'text-yellow-400' : 'text-[#666]';
	}
</script>

<svelte:head><title>Find SDR Reps — LeadOS Marketplace</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0a] text-white">
	<nav class="border-b border-[#1a1a1a] px-8 py-5 flex items-center justify-between">
		<a href="/" class="font-semibold">LeadOS</a>
		<div class="flex items-center gap-4">
			<a href="/" class="text-xs text-[#555] hover:text-white transition-colors">← Home</a>
			<a href="/contact" class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">Hire via Agency →</a>
		</div>
	</nav>

	<div class="max-w-6xl mx-auto px-6 py-12">
		<div class="mb-10">
			<h1 class="text-4xl font-bold mb-3">Find Your SDR</h1>
			<p class="text-[#555] text-lg">Vetted reps with live win rates. Hire and manage everything in one platform.</p>
		</div>

		<!-- Filters -->
		<div class="flex items-center gap-3 mb-8 flex-wrap">
			<input bind:value={search} placeholder="Search reps…"
				class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-2.5 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none w-64 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors" />

			<select bind:value={filterSpecialty}
				class="rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2.5 text-sm text-white focus:outline-none hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<option value="">All specialties</option>
				{#each Object.entries(SPECIALTIES) as [k, v]}
					<option value={k}>{v}</option>
				{/each}
			</select>

			<div class="flex gap-1">
				{#each [['available','🟢 Available'],['all','All']] as [val, label]}
					<button onclick={() => filterAvail = val}
						class="px-3 py-2 rounded-lg text-xs border transition-colors {filterAvail === val ? 'border-white text-white' : 'border-[#2a2a2a] text-[#555] hover:border-white hover:text-white'}">
						{label}
					</button>
				{/each}
			</div>

			<p class="text-xs text-[#444] ml-auto">{filtered.length} rep{filtered.length !== 1 ? 's' : ''}</p>
		</div>

		<!-- Rep grid -->
		{#if loading}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
				{#each [1,2,3,4,5,6] as _}
					<div class="h-48 bg-[#111] rounded-2xl border border-[#1a1a1a] animate-pulse"></div>
				{/each}
			</div>
		{:else if filtered.length === 0}
			<div class="text-center py-24">
				<p class="text-4xl mb-4">🔍</p>
				<p class="text-white text-lg font-semibold">No reps match your filters</p>
				<p class="text-xs text-[#555] mt-2">Try broadening your search or check back soon — more reps join weekly.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
				{#each filtered as rep}
					<a href="/rep/{rep.username}"
						class="group rounded-2xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-white transition-all duration-200 block">
						<!-- Header -->
						<div class="flex items-start gap-3 mb-4">
							<div class="w-10 h-10 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-sm font-semibold shrink-0">
								{(rep.display_name ?? rep.username ?? '?')[0].toUpperCase()}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-white font-semibold truncate">{rep.display_name ?? rep.username}</p>
								{#if rep.location}<p class="text-[10px] text-[#444]">📍 {rep.location}</p>{/if}
							</div>
							<span class="text-[10px] shrink-0 {rep.availability === 'available' ? 'text-green-400' : 'text-[#444]'}">
								{rep.availability === 'available' ? '🟢' : '⚫'}
							</span>
						</div>

						<!-- Stats -->
						{#if rep.stats}
							<div class="grid grid-cols-3 gap-2 mb-4">
								<div class="text-center rounded-lg bg-[#0d0d0d] py-1.5">
									<p class="text-sm font-semibold text-white">{rep.stats.overallConnectRate}%</p>
									<p class="text-[9px] text-[#444]">connect</p>
								</div>
								<div class="text-center rounded-lg bg-[#0d0d0d] py-1.5">
									<p class="text-sm font-semibold text-yellow-400">{rep.stats.overallWinRate}%</p>
									<p class="text-[9px] text-[#444]">win rate</p>
								</div>
								<div class="text-center rounded-lg bg-[#0d0d0d] py-1.5">
									<p class="text-sm font-semibold text-white">{rep.stats.totalCalls}</p>
									<p class="text-[9px] text-[#444]">calls</p>
								</div>
							</div>
						{/if}

						<!-- Specialties -->
						{#if rep.specialties?.length}
							<div class="flex flex-wrap gap-1 mb-3">
								{#each rep.specialties.slice(0, 3) as s}
									<span class="text-[9px] border border-[#2a2a2a] text-[#666] px-2 py-0.5 rounded-full">{SPECIALTIES[s] ?? s}</span>
								{/each}
								{#if rep.specialties.length > 3}<span class="text-[9px] text-[#333]">+{rep.specialties.length - 3}</span>{/if}
							</div>
						{/if}

						<!-- Interview score + rate -->
						<div class="flex items-center justify-between">
							{#if rep.interview_score !== null}
								<span class="text-[10px] {scoreColor(rep.interview_score ?? 0)}">
									{rep.interview_score}pts {rep.roleplay_unlocked ? '🎯' : ''}
								</span>
							{:else}
								<span class="text-[10px] text-[#333]">Interview pending</span>
							{/if}
							{#if rep.hourly_rate}
								<span class="text-[10px] text-[#666]">${rep.hourly_rate}/hr</span>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}

		<!-- HireSDRs CTA -->
	<div class="mt-16 pt-12 border-t border-[#1a1a1a] text-center">
		<p style="font-family:var(--font-label);font-size:11px;letter-spacing:.3em;color:#444" class="mb-6">LOOKING TO SCALE YOUR OUTREACH?</p>
		<a href="/contact" class="inline-block px-8 py-3 border border-[#262626] text-[#666] text-xs hover:border-[#444] hover:text-white transition-colors" style="font-family:var(--font-label);letter-spacing:.2em">
			HIRE MANAGED SDRS →
		</a>
		<p class="mt-3 text-[10px] text-[#333]">$1/contact + $200/appointment · Sparks Curiosity Studio</p>
	</div>

	</div>
</div>
