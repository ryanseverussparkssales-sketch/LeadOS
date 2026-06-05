<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	const SPECIALTIES = [
		{ key: 'saas', label: 'SaaS' },
		{ key: 'ecommerce', label: 'E-Commerce' },
		{ key: 'b2b', label: 'B2B' },
		{ key: 'creator', label: 'Creator Economy' },
		{ key: 'healthcare', label: 'Healthcare' },
		{ key: 'fintech', label: 'Fintech' },
		{ key: 'real_estate', label: 'Real Estate' },
		{ key: 'insurance', label: 'Insurance' },
		{ key: 'recruiting', label: 'Recruiting' },
		{ key: 'solar', label: 'Solar & Energy' },
		{ key: 'staffing', label: 'Staffing' },
		{ key: 'media', label: 'Media & Advertising' },
	];

	let profile = $state<any>(null);
	let loading = $state(true);
	let saving = $state(false);

	// Form fields
	let username = $state('');
	let displayName = $state('');
	let bio = $state('');
	let location = $state('');
	let hourlyRate = $state('');
	// Work history & credentials
	let yearsExperience = $state('');
	let previousRoles = $state('');
	let topAchievement = $state('');
	let certifications = $state<string[]>([]);

	const CERT_OPTIONS = [
		'LinkedIn Sales Navigator', 'Salesforce CRM', 'HubSpot Sales', 'MEDDIC',
		'Sandler Training', 'Challenger Sale', 'SPIN Selling', 'Complex B2B Sales',
	];
	let availability = $state('available');
	let specialties = $state<string[]>([]);
	let isPublic = $state(false);

	onMount(async () => {
		const r = await apiFetch('/api/rep-profile');
		if (r.ok) {
			profile = await r.json();
			if (profile) {
				username = profile.username ?? '';
				displayName = profile.display_name ?? '';
				bio = profile.bio ?? '';
				location = profile.location ?? '';
				hourlyRate = profile.hourly_rate?.toString() ?? '';
				availability = profile.availability ?? 'available';
				specialties = profile.specialties ?? [];
				isPublic = profile.is_public ?? false;
				yearsExperience = profile.years_experience?.toString() ?? '';
				previousRoles = profile.previous_roles ?? '';
				topAchievement = profile.top_achievement ?? '';
				certifications = profile.certifications ?? [];
			}
		}
		loading = false;
	});

	function toggleSpecialty(key: string) {
		specialties = specialties.includes(key)
			? specialties.filter(s => s !== key)
			: [...specialties, key];
	}

	async function save() {
		saving = true;
		const res = await apiFetch('/api/rep-profile', {
			method: 'POST',
			body: JSON.stringify({
				username: username.trim() || undefined,
				display_name: displayName.trim() || undefined,
				bio: bio.trim() || undefined,
				location: location.trim() || undefined,
				hourly_rate: hourlyRate ? parseInt(hourlyRate) : undefined,
				availability,
				specialties,
				is_public: isPublic,
				years_experience: yearsExperience ? parseInt(yearsExperience) : undefined,
				previous_roles: previousRoles.trim() || undefined,
				top_achievement: topAchievement.trim() || undefined,
				certifications,
			}),
		});
		if (res.ok) {
			profile = await res.json();
			toastSuccess('Profile saved');
		} else {
			const d = await res.json().catch(() => ({}));
			toastError(d.message ?? 'Failed to save');
		}
		saving = false;
	}

</script>

<svelte:head><title>My Profile — Edelhaus SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="text-white text-xl font-semibold">My Rep Profile</h2>
			<p class="text-xs text-[#555] mt-0.5">Your internal rep profile and certification.</p>
		</div>
	</div>

	{#if loading}
		<div class="space-y-4">{#each [1,2,3] as _}<div class="h-16 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>
	{:else}
		<div class="space-y-5">

			<!-- Interview badge -->
			{#if profile?.interview_score !== null && profile?.interview_score !== undefined}
				<div class="rounded-xl border {profile.interview_score >= 70 ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12' : 'border-[#2a2a2a] bg-[#111]'} p-4 flex items-center gap-3">
					<p class="text-2xl font-bold {profile.interview_score >= 85 ? 'text-[var(--accent)]' : profile.interview_score >= 70 ? 'text-yellow-400' : 'text-[#666]'}">{profile.interview_score}</p>
					<div>
						<p class="text-xs text-white font-medium">AI Interview Score</p>
						<p class="text-[10px] text-[#555]">
							{profile.interview_score >= 70 ? '✓ Live Roleplay unlocked' : 'Score ≥ 70 to unlock Live Roleplay'}
							· <a href="/sdr/interview" class="underline hover:text-white">Retake interview</a>
						</p>
					</div>
				</div>
			{:else}
				<div class="rounded-xl border border-yellow-900/40 bg-yellow-950/10 p-4">
					<p class="text-xs text-yellow-400 font-medium">Complete your AI Interview to unlock your profile badge</p>
					<a href="/sdr/interview" class="text-[10px] text-yellow-600 hover:text-yellow-400 underline mt-1 block">Start interview →</a>
				</div>
			{/if}

			<!-- Basic info -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#555] uppercase tracking-widest">Basic Info</p>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-[#555] mb-1">Display Name</label>
						<input bind:value={displayName} placeholder="Ryan Sparks"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-[#555] mb-1">Location</label>
						<input bind:value={location} placeholder="New York, NY"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-[#555] mb-1">Hourly Rate ($)</label>
						<input type="number" bind:value={hourlyRate} placeholder="75" min="0"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
					</div>
				</div>
				<div>
					<label class="block text-xs text-[#555] mb-1">Bio</label>
					<textarea bind:value={bio} rows="3" placeholder="5+ years in SaaS outbound. Specializing in..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none resize-none"></textarea>
				</div>
				<div>
					<label class="block text-xs text-[#555] mb-2">Availability</label>
					<div class="flex gap-2">
						{#each [['available','Available'],['busy','Busy'],['unavailable','Unavailable']] as [val, label]}
							<button onclick={() => availability = val}
								class="px-3 py-1.5 rounded-lg text-xs border transition-colors {availability === val ? 'border-white text-white bg-white/10' : 'border-[#2a2a2a] text-[#555] hover:border-white hover:text-white'}">
								{label}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Specialties -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#555] uppercase tracking-widest mb-3">Specialties</p>
				<div class="flex flex-wrap gap-2">
					{#each SPECIALTIES as s}
						<button onclick={() => toggleSpecialty(s.key)}
							class="px-3 py-1.5 rounded-full text-xs border transition-colors {specialties.includes(s.key) ? 'border-white bg-white/10 text-white' : 'border-[#2a2a2a] text-[#555] hover:border-white hover:text-white'}">
							{s.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Work history & credentials -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#555] uppercase tracking-widest">Work History & Credentials</p>
				<div>
					<label class="block text-xs text-[#555] mb-1">Years of Experience</label>
					<input type="number" bind:value={yearsExperience} placeholder="5" min="0"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
				</div>
				<div>
					<label class="block text-xs text-[#555] mb-1">Previous Roles</label>
					<textarea bind:value={previousRoles} rows="3" placeholder="Previous roles and experience..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
				</div>
				<div>
					<label class="block text-xs text-[#555] mb-1">Top Achievement</label>
					<input bind:value={topAchievement} placeholder="Closed $1.2M in new ARR in 2024"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
				</div>
				<div>
					<label class="block text-xs text-[#555] mb-2">Certifications</label>
					<div class="flex flex-wrap gap-2">
						{#each CERT_OPTIONS as cert}
							<button onclick={() => certifications = certifications.includes(cert) ? certifications.filter(c => c !== cert) : [...certifications, cert]}
								class="px-3 py-1.5 rounded-full text-xs border transition-colors {certifications.includes(cert) ? 'border-white bg-white/10 text-white' : 'border-[#2a2a2a] text-[#555] hover:border-white hover:text-white'}">
								{cert}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Save -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5">
				<button onclick={save} disabled={saving}
					class="w-full rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50 transition-colors">
					{saving ? 'Saving…' : 'Save Profile'}
				</button>
			</div>
		</div>
{/if}
</div>
