<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Call {
		id: string; created_at: string; outcome: string | null;
		summary: string | null; recording_url: string | null;
		raw_transcript: string | null; call_duration_seconds: number | null;
		notes: string | null;
		contact: { id: string; name: string; company: string | null } | null;
		sdr_email?: string;
	}
	interface Feedback {
		id: string; content: string; rating: number | null;
		timestamp_seconds: number | null; created_at: string;
	}

	let calls = $state<Call[]>([]);
	let loading = $state(true);
	let selectedCall = $state<Call | null>(null);
	let feedback = $state<Feedback[]>([]);
	let loadingFeedback = $state(false);

	// Feedback form
	let newNote = $state('');
	let newRating = $state<number | null>(null);
	let noteTimestamp = $state('');
	let savingNote = $state(false);

	// Audio player ref
	let audioEl = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);

	// Filters
	let filterOutcome = $state('');
	const WIN_OUTCOMES = ['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback'];

	onMount(async () => {
		const r = await apiFetch('/api/calls?limit=100');
		if (r.ok) {
			const data = await r.json();
			calls = data.filter((c: Call) => c.recording_url || c.raw_transcript);
		}
		loading = false;
	});

	async function selectCall(call: Call) {
		selectedCall = call;
		feedback = [];
		loadingFeedback = true;
		const r = await apiFetch(`/api/calls/${call.id}/feedback`);
		if (r.ok) feedback = await r.json();
		loadingFeedback = false;
	}

	async function saveNote() {
		if (!selectedCall || !newNote.trim()) return;
		savingNote = true;
		const tsSeconds = noteTimestamp
			? parseInt(noteTimestamp.split(':')[0]) * 60 + parseInt(noteTimestamp.split(':')[1] ?? '0')
			: Math.round(currentTime) || null;

		const r = await apiFetch(`/api/calls/${selectedCall.id}/feedback`, {
			method: 'POST',
			body: JSON.stringify({ content: newNote.trim(), rating: newRating, timestamp_seconds: tsSeconds }),
		});
		if (r.ok) {
			feedback = [...feedback, await r.json()];
			newNote = ''; newRating = null; noteTimestamp = '';
		}
		savingNote = false;
	}

	async function deleteNote(id: string) {
		if (!selectedCall) return;
		await apiFetch(`/api/calls/${selectedCall.id}/feedback?feedback_id=${id}`, { method: 'DELETE' });
		feedback = feedback.filter(f => f.id !== id);
	}

	function fmtSecs(s: number | null) {
		if (!s) return '';
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	function jumpTo(seconds: number | null) {
		if (!audioEl || !seconds) return;
		audioEl.currentTime = seconds;
		audioEl.play().catch(() => {});
	}

	const OUTCOME_LABEL: Record<string, string> = {
		appointment_set: '📅 Appt', demo_scheduled: '🖥 Demo',
		callback: '🔄 Callback', voicemail: '📬 VM', no_answer: '—',
		not_interested: '✕ NI', follow_up_agreed: '↩ Follow-up',
	};

	const filtered = $derived(
		filterOutcome ? calls.filter(c => c.outcome === filterOutcome) : calls
	);
</script>

<svelte:head><title>Call Review — LeadOS</title></svelte:head>

<div class="flex h-full overflow-hidden">

	<!-- Left: call list -->
	<div class="w-80 shrink-0 border-r border-[#1a1a1a] flex flex-col">
		<div class="px-5 py-4 border-b border-[#1a1a1a]">
			<h2 class="text-sm text-white font-medium">Call Review</h2>
			<p class="text-[10px] text-[#444] mt-0.5">Recorded calls — leave coaching notes</p>
			<select bind:value={filterOutcome}
				class="mt-3 w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-2 py-1.5 text-xs text-white focus:outline-none">
				<option value="">All outcomes</option>
				{#each Object.entries(OUTCOME_LABEL) as [v, l]}
					<option value={v}>{l}</option>
				{/each}
			</select>
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if loading}
				{#each [1,2,3,4,5] as _}
					<div class="h-16 border-b border-[#111] bg-[#0d0d0d] animate-pulse"></div>
				{/each}
			{:else if filtered.length === 0}
				<div class="p-6 text-center">
					<p class="text-xs text-[#444]">No recorded calls yet</p>
				</div>
			{:else}
				{#each filtered as call}
					<button onclick={() => selectCall(call)}
						class="w-full text-left px-4 py-3 border-b border-[#111] hover:bg-[#111] transition-colors {selectedCall?.id === call.id ? 'bg-[#111] border-l-2 border-l-white' : ''}">
						<div class="flex items-center justify-between gap-2 mb-0.5">
							<p class="text-xs text-white font-medium truncate">{call.contact?.name ?? 'Unknown'}</p>
							<span class="text-[9px] text-[#555] shrink-0">{new Date(call.created_at).toLocaleDateString()}</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-[9px] text-[#555]">{call.contact?.company ?? ''}</span>
							{#if call.outcome}
								<span class="text-[9px] text-[#444]">· {OUTCOME_LABEL[call.outcome] ?? call.outcome}</span>
							{/if}
							{#if call.recording_url}
								<span class="text-[9px] text-blue-500 ml-auto">🎙</span>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Right: review panel -->
	<div class="flex-1 overflow-y-auto">
		{#if !selectedCall}
			<div class="flex items-center justify-center h-full">
				<div class="text-center">
					<p class="text-4xl mb-3">🎙</p>
					<p class="text-sm text-white font-medium">Select a call to review</p>
					<p class="text-xs text-[#444] mt-1">Leave timestamped coaching notes for your SDRs</p>
				</div>
			</div>
		{:else}
			<div class="p-6 max-w-3xl mx-auto space-y-5">

				<!-- Header -->
				<div class="flex items-start justify-between gap-4">
					<div>
						<h3 class="text-white font-semibold">{selectedCall.contact?.name ?? 'Unknown'}</h3>
						<p class="text-xs text-[#555] mt-0.5">
							{selectedCall.contact?.company ?? ''} ·
							{new Date(selectedCall.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} ·
							{selectedCall.call_duration_seconds ? fmtSecs(selectedCall.call_duration_seconds) : '—'}
						</p>
					</div>
					{#if selectedCall.outcome}
						<span class="text-xs border border-[#2a2a2a] px-2 py-0.5 rounded text-[#888]">
							{OUTCOME_LABEL[selectedCall.outcome] ?? selectedCall.outcome}
						</span>
					{/if}
				</div>

				<!-- Audio player -->
				{#if selectedCall.recording_url}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<p class="text-[10px] text-[#444] uppercase tracking-widest mb-3">Recording</p>
						<!-- svelte-ignore a11y_media_has_caption -->
						<audio
							bind:this={audioEl}
							ontimeupdate={() => { if (audioEl) currentTime = audioEl.currentTime; }}
							controls
							src={selectedCall.recording_url}
							class="w-full h-8"
						></audio>
						{#if currentTime > 0}
							<p class="text-[9px] text-[#444] mt-1.5">📍 {fmtSecs(Math.round(currentTime))} — use this as timestamp when adding notes</p>
						{/if}
					</div>
				{/if}

				<!-- Transcript -->
				{#if selectedCall.raw_transcript}
					<details class="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<summary class="px-4 py-3 text-xs text-[#555] cursor-pointer hover:text-white transition-colors">📝 Transcript</summary>
						<div class="px-4 pb-4">
							<p class="text-xs text-[#888] leading-relaxed whitespace-pre-wrap">{selectedCall.raw_transcript}</p>
						</div>
					</details>
				{/if}

				{#if selectedCall.summary}
					<div class="rounded-xl border border-[#1e2a1e] bg-[#0d150d] p-4">
						<p class="text-[10px] text-green-500 uppercase tracking-widest mb-2">✦ AI Summary</p>
						<p class="text-xs text-[#ccc] leading-relaxed">{selectedCall.summary}</p>
					</div>
				{/if}

				<!-- Existing feedback -->
				<div>
					<p class="text-[10px] text-[#444] uppercase tracking-widest mb-3">
						Coaching Notes ({feedback.length})
					</p>
					{#if loadingFeedback}
						<div class="space-y-2">{#each [1,2] as _}<div class="h-14 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>
					{:else if feedback.length === 0}
						<div class="rounded-xl border border-dashed border-[#2a2a2a] p-4 text-center">
							<p class="text-xs text-[#444]">No notes yet — add the first coaching note below</p>
						</div>
					{:else}
						<div class="space-y-2">
							{#each feedback as note}
								<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 flex gap-3 group hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
									<div class="flex-1 min-w-0">
										{#if note.timestamp_seconds}
											<button onclick={() => jumpTo(note.timestamp_seconds)}
												class="text-[9px] text-blue-400 hover:text-blue-300 mb-1 block">
												⏱ {fmtSecs(note.timestamp_seconds)} →
											</button>
										{/if}
										{#if note.rating}
											<div class="flex gap-0.5 mb-1">
												{#each Array(5) as _, i}
													<span class="text-xs {i < note.rating ? 'text-yellow-400' : 'text-[#333]'}">★</span>
												{/each}
											</div>
										{/if}
										<p class="text-xs text-[#ccc] leading-relaxed">{note.content}</p>
										<p class="text-[9px] text-[#333] mt-1">{new Date(note.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
									</div>
									<button onclick={() => deleteNote(note.id)}
										class="text-[#222] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all shrink-0">✕</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Add note form -->
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<p class="text-[10px] text-[#444] uppercase tracking-widest">Add Coaching Note</p>
					<textarea bind:value={newNote} rows="3"
						placeholder="What should the SDR do differently? Be specific — include timestamps where possible..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none resize-none"></textarea>
					<div class="flex items-center gap-3">
						<!-- Rating -->
						<div class="flex gap-1">
							{#each [1,2,3,4,5] as star}
								<button onclick={() => newRating = newRating === star ? null : star}
									class="text-sm transition-colors {newRating && star <= newRating ? 'text-yellow-400' : 'text-[#333] hover:text-yellow-600'}">★</button>
							{/each}
						</div>
						<!-- Timestamp input -->
						<input bind:value={noteTimestamp} placeholder="m:ss (optional)"
							class="w-20 rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none"
							title="Jump-to timestamp e.g. 2:14" />
						{#if audioEl && currentTime > 0}
							<button onclick={() => noteTimestamp = fmtSecs(Math.round(currentTime))}
								class="text-[9px] text-blue-400 hover:text-blue-300">Use {fmtSecs(Math.round(currentTime))}</button>
						{/if}
						<button onclick={saveNote} disabled={savingNote || !newNote.trim()}
							class="ml-auto rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5] transition-colors">
							{savingNote ? 'Saving…' : 'Add Note'}
						</button>
					</div>
				</div>

			</div>
		{/if}
	</div>
</div>
