<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Clip { id: string; clip_type: string; transcript_excerpt: string | null; ai_reason: string | null; recording_url: string | null; is_featured: boolean; display_order: number; created_at: string; }
	interface Testimonial { id: string; client_name: string; client_company: string | null; client_title: string | null; content: string; rating: number; approved: boolean; created_at: string; }

	let clips = $state<Clip[]>([]);
	let testimonials = $state<Testimonial[]>([]);
	let loadingClips = $state(true);
	let generating = $state(false);

	// Testimonial form
	let showTestiForm = $state(false);
	let testClientName = $state('');
	let testClientCompany = $state('');
	let testClientTitle = $state('');
	let testContent = $state('');
	let testRating = $state(5);
	let savingTest = $state(false);

	const CLIP_ICONS: Record<string, string> = { opener: '👋', objection: '🛡', genuine: '⚡' };
	const CLIP_LABELS: Record<string, string> = { opener: 'Cold Open', objection: 'Objection Handling', genuine: 'Standout Moment' };

	onMount(async () => {
		const [clipRes, testRes] = await Promise.all([
			apiFetch('/api/rep-profile/supercut'),
			apiFetch('/api/rep-profile/testimonials'),
		]);
		if (clipRes.ok) clips = await clipRes.json();
		if (testRes.ok) testimonials = await testRes.json();
		loadingClips = false;
	});

	async function generateSupercut() {
		generating = true;
		const res = await apiFetch('/api/rep-profile/supercut', { method: 'POST' });
		if (res.ok) {
			const d = await res.json();
			clips = await (await apiFetch('/api/rep-profile/supercut')).json();
			toastSuccess(`Found ${d.generated} new clips`);
		}
		generating = false;
	}

	async function toggleFeatured(clip: Clip) {
		const newVal = !clip.is_featured;
		const res = await apiFetch(`/api/rep-profile/supercut?id=${clip.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ is_featured: newVal, display_order: clip.display_order }),
		});
		if (res.ok) {
			clips = clips.map(c => c.id === clip.id ? { ...c, is_featured: newVal } : c);
		} else {
			toastError('Failed to update clip — try again');
		}
	}

	async function removeClip(id: string) {
		if (!confirm('Remove this clip from your portfolio?')) return;
		// Use DELETE endpoint
		const res = await apiFetch(`/api/rep-profile/supercut?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			clips = clips.filter(c => c.id !== id);
			toastSuccess('Clip removed');
		} else {
			toastError('Failed to remove clip — try again');
		}
	}

	async function saveTestimonial() {
		savingTest = true;
		const res = await apiFetch('/api/rep-profile/testimonials', {
			method: 'POST',
			body: JSON.stringify({
				clientName: testClientName, clientCompany: testClientCompany || undefined,
				clientTitle: testClientTitle || undefined, content: testContent,
				rating: testRating, approved: true,
			}),
		});
		if (res.ok) {
			testimonials = [await res.json(), ...testimonials];
			testClientName = ''; testClientCompany = ''; testClientTitle = ''; testContent = ''; testRating = 5;
			showTestiForm = false;
			toastSuccess('Testimonial added');
		} else { toastError('Failed to save'); }
		savingTest = false;
	}

	async function deleteTestimonial(id: string) {
		if (!confirm('Delete this testimonial?')) return;
		const res = await apiFetch(`/api/rep-profile/testimonials?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			testimonials = testimonials.filter(t => t.id !== id);
			toastSuccess('Testimonial deleted');
		} else {
			toastError('Failed to delete testimonial — try again');
		}
	}

	const featuredClips = $derived(clips.filter(c => c.is_featured));
	const allClips = $derived(clips.filter(c => !c.is_featured));
</script>

<svelte:head><title>My Portfolio — RogueOS SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto space-y-8">

	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-white text-xl font-semibold">My Portfolio</h2>
			<p class="text-xs text-[#555] mt-0.5">Your best call highlights and testimonials, kept in one place</p>
		</div>
		<button onclick={generateSupercut} disabled={generating}
			class="rounded-lg border border-[var(--accent)]/40 px-4 py-2 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] disabled:opacity-40 transition-colors">
			{generating ? '✦ Scanning calls…' : '✦ Find new clips'}
		</button>
	</div>

	<!-- Featured clips (shown on profile) -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<p class="text-xs text-[#555] uppercase tracking-widest">📌 Featured on profile ({featuredClips.length}/3 max)</p>
			<p class="text-[10px] text-[#333]">Your top 3 highlights</p>
		</div>
		{#if featuredClips.length === 0}
			<div class="rounded-xl border border-dashed border-[#2a2a2a] p-6 text-center">
				<p class="text-xs text-[#444]">No featured clips yet — star clips below to pin them to your profile</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each featuredClips as clip}
					<div class="rounded-xl border border-yellow-800/30 bg-yellow-950/10 p-4 flex items-start gap-3">
						<span class="text-base">{CLIP_ICONS[clip.clip_type] ?? '📞'}</span>
						<div class="flex-1 min-w-0">
							<p class="text-xs text-[#666] uppercase tracking-widest mb-1">{CLIP_LABELS[clip.clip_type]}</p>
							{#if clip.transcript_excerpt}
								<p class="text-xs text-[#ccc] leading-relaxed italic">"{clip.transcript_excerpt.slice(0, 120)}…"</p>
							{/if}
							{#if clip.ai_reason}<p class="text-[9px] text-[#444] mt-1">✦ {clip.ai_reason}</p>{/if}
						</div>
						<button onclick={() => toggleFeatured(clip)} class="text-yellow-400 hover:text-yellow-300 text-sm shrink-0" title="Unfeature">★</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- All clips -->
	{#if loadingClips}
		<div class="space-y-2">{#each [1,2,3] as _}<div class="h-16 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>
	{:else if clips.length === 0}
		<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-8 text-center hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
			<p class="text-3xl mb-3">🎙</p>
			<p class="text-white text-sm font-medium">No call clips yet</p>
			<p class="text-xs text-[#555] mt-2">Make recorded calls — the AI will scan transcripts and pull your best moments.</p>
			<button onclick={generateSupercut} disabled={generating}
				class="mt-4 rounded-lg border border-[var(--accent)]/40 px-4 py-2 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] disabled:opacity-40">
				{generating ? 'Scanning…' : '✦ Scan my calls now'}
			</button>
		</div>
	{:else if allClips.length > 0}
		<div>
			<p class="text-xs text-[#555] uppercase tracking-widest mb-3">All clips ({allClips.length}) — star to feature</p>
			<div class="space-y-2">
				{#each allClips as clip}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 flex items-start gap-3 group hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<span class="text-base">{CLIP_ICONS[clip.clip_type] ?? '📞'}</span>
						<div class="flex-1 min-w-0">
							<p class="text-xs text-[#666] uppercase tracking-widest mb-1">{CLIP_LABELS[clip.clip_type]}</p>
							{#if clip.transcript_excerpt}
								<p class="text-xs text-[#ccc] leading-relaxed italic">"{clip.transcript_excerpt.slice(0, 120)}…"</p>
							{/if}
							{#if clip.ai_reason}<p class="text-[9px] text-[#444] mt-1">✦ {clip.ai_reason}</p>{/if}
						{#if clip.recording_url}
							<a href={clip.recording_url} target="_blank" rel="noopener noreferrer"
								class="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hi)] transition-colors mt-1 block">🎧 Listen</a>
						{/if}
						<p class="text-[9px] text-[#333] mt-1">{new Date(clip.created_at).toLocaleDateString()}</p>
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<button onclick={() => toggleFeatured(clip)}
								disabled={!clip.is_featured && featuredClips.length >= 3}
								class="text-[#333] hover:text-yellow-400 text-sm disabled:opacity-30 transition-colors" title="Feature on profile">☆</button>
							<button onclick={() => removeClip(clip.id)} class="text-[#222] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"><Icon name="x" size={14} /></button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Testimonials -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<p class="text-xs text-[#555] uppercase tracking-widest">⭐ Testimonials ({testimonials.length})</p>
			<button onclick={() => showTestiForm = !showTestiForm}
				class="text-xs border border-[#2a2a2a] px-3 py-1 rounded-lg text-[#555] hover:border-white hover:text-white transition-colors">
				{showTestiForm ? 'Cancel' : '+ Add testimonial'}
			</button>
		</div>

		{#if showTestiForm}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 mb-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#555]">Add a testimonial from a client or manager for your portfolio.</p>
				<div class="grid grid-cols-3 gap-2">
					<input bind:value={testClientName} placeholder="Client name *"
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
					<input bind:value={testClientCompany} placeholder="Company"
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
					<input bind:value={testClientTitle} placeholder="Title"
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
				</div>
				<textarea bind:value={testContent} rows="3" placeholder="What they said about working with you…"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none resize-none"></textarea>
				<div class="flex items-center gap-3">
					<div class="flex gap-1">
						{#each [1,2,3,4,5] as star}
							<button onclick={() => testRating = star} class="text-lg transition-colors {star <= testRating ? 'text-yellow-400' : 'text-[#333]'}">★</button>
						{/each}
					</div>
					<button onclick={saveTestimonial} disabled={savingTest || !testClientName || !testContent}
						class="ml-auto rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">
						{savingTest ? 'Saving…' : 'Add Testimonial'}
					</button>
				</div>
			</div>
		{/if}

		{#if testimonials.length === 0 && !showTestiForm}
			<div class="rounded-xl border border-[#1a1a1a] bg-[#111] p-5 text-center">
				<p class="text-xs text-[#444]">No testimonials yet. Ask a client or manager to write one — then add it here.</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each testimonials as t}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 group hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<div class="flex items-start justify-between gap-3">
							<div class="flex-1">
								<div class="flex items-center gap-2 mb-2">
									{#each Array(t.rating) as _}<span class="text-yellow-400 text-xs">★</span>{/each}
								</div>
								<p class="text-sm text-[#ccc] leading-relaxed italic">"{t.content}"</p>
								<p class="text-xs text-[#555] mt-2">— {t.client_name}{t.client_title ? `, ${t.client_title}` : ''}{t.client_company ? ` @ ${t.client_company}` : ''}</p>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								{#if t.approved}<span class="text-[9px] text-[var(--accent)]">✓ Approved</span>{/if}
							</div>
						</div>
				</div>
					{/each}
			</div>
				{/if}
		</div>
	</div>
