<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	const username = $derived($page.params.username);

	interface RepProfile {
		user_id: string; username: string; display_name: string | null;
		bio: string | null; location: string | null; specialties: string[];
		hourly_rate: number | null; availability: string; interview_score: number | null;
		roleplay_unlocked: boolean; is_public: boolean;
		years_experience?: number | null; previous_roles?: string | null;
		top_achievement?: string | null; certifications?: string[];
	}
	interface Clip { id: string; clip_type: string; transcript_excerpt: string; ai_reason: string; recording_url: string; is_featured?: boolean; }
	interface Testimonial { id: string; client_name: string; client_company: string | null; client_title: string | null; content: string; rating: number; }

	let profile = $state<RepProfile | null>(null);
	let clips = $state<Clip[]>([]);
	let testimonials = $state<Testimonial[]>([]);
	let stats = $state<{totalCalls:number; overallConnectRate:number; overallWinRate:number} | null>(null);
	let loading = $state(true);
	let notFound = $state(false);
	let playingClip = $state<string | null>(null);

	const SPECIALTY_LABELS: Record<string,string> = {
		saas: 'SaaS', ecommerce: 'E-Commerce', b2b: 'B2B', creator: 'Creator Economy',
		healthcare: 'Healthcare', fintech: 'Fintech', real_estate: 'Real Estate',
		insurance: 'Insurance', recruiting: 'Recruiting', solar: 'Solar & Energy',
	};

	const CLIP_ICONS: Record<string,string> = { opener: '👋', objection: '🛡', genuine: '⚡' };
	const CLIP_LABELS: Record<string,string> = { opener: 'Cold Open', objection: 'Objection Handling', genuine: 'Standout Moment' };

	const scoreColor = (s: number) => s >= 85 ? 'text-green-400' : s >= 70 ? 'text-yellow-400' : 'text-[#888]';
	const scoreBadge = (s: number) => s >= 85 ? '⭐ Excellent' : s >= 70 ? '✓ Certified' : 'In Progress';

	onMount(async () => {
		// Public profile — use fetch directly
		const r = await fetch(`/api/rep-profile/public?username=${encodeURIComponent(username)}`);
		if (!r.ok) { notFound = true; loading = false; return; }
		const d = await r.json();
		profile = d.profile;
		clips = (d.clips ?? []).filter((c: Clip) => c.is_featured !== false);
		stats = d.stats ?? null;
		// Load testimonials separately (public endpoint)
		const userId = d.profile?.user_id;
		if (userId) {
			const tRes = await fetch(`/api/rep-profile/testimonials?user_id=${userId}`);
			if (tRes.ok) testimonials = await tRes.json();
		}
		loading = false;
	});
</script>

<svelte:head>
	<title>{profile?.display_name ?? username} — LeadOS Rep Profile</title>
</svelte:head>

<div class="min-h-screen bg-[#0a0a0a] text-white">
	<nav class="border-b border-[#1a1a1a] px-8 py-4 flex items-center justify-between">
		<a href="/" class="text-sm font-semibold">LeadOS</a>
		<a href="/#pricing" class="text-xs text-[#555] hover:text-white transition-colors">Hire a rep →</a>
	</nav>

	{#if loading}
		<div class="flex items-center justify-center h-64">
			<div class="w-4 h-4 rounded-full bg-white animate-pulse"></div>
		</div>
	{:else if notFound || !profile}
		<div class="text-center py-32">
			<p class="text-4xl mb-4">🔍</p>
			<p class="text-white text-lg font-semibold">Rep not found</p>
			<p class="text-sm text-[#555] mt-2">@{username} doesn't exist or hasn't published their profile.</p>
		</div>
	{:else}
		<div class="max-w-3xl mx-auto px-6 py-12 space-y-8">

			<!-- Header -->
			<div class="flex items-start gap-6">
				<div class="w-16 h-16 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-2xl shrink-0">
					{(profile.display_name ?? profile.username ?? '?')[0].toUpperCase()}
				</div>
				<div class="flex-1">
					<div class="flex items-center gap-3 flex-wrap">
						<h1 class="text-2xl font-bold">{profile.display_name ?? profile.username}</h1>
						{#if profile.interview_score !== null}
							<span class="text-xs px-2.5 py-1 rounded-full border {profile.interview_score >= 70 ? 'border-green-800 bg-green-950/20 text-green-400' : 'border-[#2a2a2a] text-[#666]'}">
								{scoreBadge(profile.interview_score)}
							</span>
						{/if}
						{#if profile.roleplay_unlocked}
							<span class="text-xs px-2.5 py-1 rounded-full border border-yellow-800 bg-yellow-950/20 text-yellow-400">
								🎯 Live Roleplay Certified
							</span>
						{/if}
					</div>
					{#if profile.location}<p class="text-xs text-[#555] mt-0.5">📍 {profile.location}</p>{/if}
					{#if profile.bio}<p class="text-sm text-[#888] mt-3 leading-relaxed max-w-xl">{profile.bio}</p>{/if}

					<div class="flex items-center gap-4 mt-4 flex-wrap">
						<span class="text-xs px-2 py-1 rounded-full {profile.availability === 'available' ? 'bg-green-950/30 text-green-400 border border-green-900' : 'bg-[#1a1a1a] text-[#555] border border-[#2a2a2a]'}">
							{profile.availability === 'available' ? '🟢 Available' : profile.availability === 'busy' ? '🟡 Busy' : '⚫ Unavailable'}
						</span>
						{#if profile.hourly_rate}
							<span class="text-xs text-[#666]">${profile.hourly_rate}/hr</span>
						{/if}
					</div>
				</div>

				<a href="/contact"
					class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors shrink-0">
					Hire via LeadOS →
				</a>
			</div>

			<!-- Stats row -->
			{#if stats}
				<div class="grid grid-cols-3 gap-4">
					{#each [
						{ label: 'Calls Logged', value: stats.totalCalls },
						{ label: 'Connect Rate', value: `${stats.overallConnectRate}%` },
						{ label: 'Win Rate', value: `${stats.overallWinRate}%` },
					] as s}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 text-center hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-2xl font-bold text-white">{s.value}</p>
							<p class="text-xs text-[#555] mt-1">{s.label}</p>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Interview score -->
			{#if profile.interview_score !== null}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<p class="text-xs text-[#555] uppercase tracking-widest mb-3">AI Interview Score</p>
					<div class="flex items-center gap-4">
						<p class="text-4xl font-bold {scoreColor(profile.interview_score)}">{profile.interview_score}</p>
						<div class="flex-1">
							<div class="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
								<div class="h-full rounded-full transition-all {profile.interview_score >= 85 ? 'bg-green-500' : profile.interview_score >= 70 ? 'bg-yellow-500' : 'bg-[#444]'}"
									style="width:{profile.interview_score}%"></div>
							</div>
							<p class="text-[10px] text-[#444] mt-1">Scored on: tone, structure, objection handling, clarity, sales instinct</p>
						</div>
					</div>
				</div>
			{/if}

			<!-- Specialties -->
			{#if profile.specialties?.length}
				<div>
					<p class="text-xs text-[#555] uppercase tracking-widest mb-3">Specialties</p>
					<div class="flex flex-wrap gap-2">
						{#each profile.specialties as s}
							<span class="px-3 py-1.5 rounded-full border border-[#2a2a2a] bg-[#111] text-xs text-[#888]">
								{SPECIALTY_LABELS[s] ?? s}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Work history & credentials -->
			{#if profile.years_experience || profile.previous_roles || profile.top_achievement || profile.certifications?.length}
				<div>
					<p class="text-xs text-[#555] uppercase tracking-widest mb-3">Experience</p>
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-2 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						{#if profile.years_experience}
							<div class="flex items-center gap-2">
								<span class="text-sm">📅</span>
								<p class="text-sm text-white">{profile.years_experience} years in sales</p>
							</div>
						{/if}
						{#if profile.previous_roles}
							<div class="flex items-start gap-2">
								<span class="text-sm">🏢</span>
								<p class="text-sm text-[#888]">{profile.previous_roles}</p>
							</div>
						{/if}
					