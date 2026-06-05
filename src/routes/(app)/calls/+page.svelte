<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastError } from '$lib/stores/toast';

	interface Contact { id: string; name: string; phone: string; company: string; }
	interface Call {
		id: string;
		contact: Contact;
		created_at: string;
		call_duration_seconds: number | null;
		outcome: string | null;
		summary: string | null;
		raw_transcript: string | null;
		recording_url: string | null;
		quality_score: number | null;
		notes: string | null;
	}

	let calls = $state<Call[]>([]);
	let selected = $state<Call | null>(null);
	let loading = $state(true);
	let filterOutcome = $state('');

	const outcomeLabels: Record<string, string> = {
		// Connected
		answered:           'Answered',
		left_voicemail:     'Left Voicemail',
		// No Contact
		no_answer:          'No Answer',
		busy:               'Busy',
		wrong_number:       'Wrong Number',
		gatekeeper:         'Gatekeeper',
		// Wins
		appointment_set:    'Appointment Set',
		demo_scheduled:     'Demo Scheduled',
		meeting_confirmed:  'Meeting Confirmed',
		callback:           'Requested Callback',
		info_requested:     'Requested Info',
		decision_maker:     'Reached Decision Maker',
		referral:           'Gave Referral',
		follow_up_agreed:   'Agreed to Follow Up',
		proposal_requested: 'Requested Proposal',
		trial_started:      'Started Trial',
		signed_up:          'Signed Up',
		investment_interest:'Investment Interest',
		// Dead
		not_interested:     'Not Interested',
		do_not_call:        'Do Not Call',
		disconnected:       'Disconnected',
	};

	onMount(() => loadCalls());

	async function loadCalls() {
		loading = true;
		const params = new URLSearchParams({ limit: '100' });
		if (filterOutcome) params.set('outcome', filterOutcome);
		const res = await apiFetch(`/api/calls?${params}`);
		if (!res.ok) toastError('Could not load calls — check your connection');
		calls = res.ok ? await res.json() : [];
		loading = false;
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleString();
	}

	function formatDuration(s: number | null) {
		if (!s) return '—';
		return `${Math.floor(s / 60)}m ${s % 60}s`;
	}

	function outcomeColor(o: string | null) {
		if (!o) return 'text-[#444]';
		const WINS = new Set(['appointment_set','demo_scheduled','meeting_confirmed','callback',
			'info_requested','decision_maker','referral','follow_up_agreed','proposal_requested',
			'trial_started','signed_up','investment_interest']);
		const DEAD = new Set(['not_interested','do_not_call','disconnected','wrong_number']);
		if (WINS.has(o)) return 'text-[var(--accent)]';
		if (DEAD.has(o)) return 'text-red-400';
		if (o === 'answered') return 'text-blue-400';
		if (o === 'left_voicemail') return 'text-yellow-400';
		return 'text-[#555]';
	}

	const recordingUrl = $derived(
		selected?.id ? `/api/calls/recording?call_id=${selected.id}` : null
	);

	// Reset recording-load error whenever the selected call changes
	let recordingError = $state(false);
	$effect(() => { selected?.id; recordingError = false; });
</script>

<svelte:head><title>Calls — RogueOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Calls</h2>
		<select bind:value={filterOutcome} onchange={loadCalls}
			class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
			<option value="">All outcomes</option>
			<optgroup label="Connected">
				{#each ['answered','left_voicemail'] as v}
					<option value={v}>{outcomeLabels[v]}</option>
				{/each}
			</optgroup>
			<optgroup label="Wins">
				{#each ['appointment_set','demo_scheduled','meeting_confirmed','callback','referral','follow_up_agreed','proposal_requested','signed_up','investment_interest'] as v}
					<option value={v}>{outcomeLabels[v]}</option>
				{/each}
			</optgroup>
			<optgroup label="No Contact">
				{#each ['no_answer','busy','wrong_number','gatekeeper'] as v}
					<option value={v}>{outcomeLabels[v]}</option>
				{/each}
			</optgroup>
			<optgroup label="Dead">
				{#each ['not_interested','do_not_call','disconnected'] as v}
					<option value={v}>{outcomeLabels[v]}</option>
				{/each}
			</optgroup>
		</select>
		<span class="text-xs text-[#444]">{calls.length} calls</span>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Calls list -->
		<div class="w-80 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#if loading}
				<div class="p-4 space-y-2">
					{#each [1,2,3,4,5,6] as _}
						<div class="h-16 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
					{/each}
				</div>
				{:else if calls.length === 0}
				<p class="text-[#444] text-xs text-center py-8">No calls yet</p>
			{:else}
				{#each calls as call}
					<button onclick={() => selected = call}
						class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selected?.id === call.id ? 'bg-white/10' : 'hover:bg-white/5'}">
						<div class="flex items-center justify-between mb-1">
							<p class="text-sm text-white font-medium truncate">{call.contact?.name ?? '—'}</p>
							<span class="text-xs {outcomeColor(call.outcome)} shrink-0 ml-2">
								{outcomeLabels[call.outcome ?? ''] ?? '—'}
							</span>
						</div>
						<p class="text-xs text-[#555] truncate">{call.contact?.company ?? ''}</p>
						<div class="flex items-center gap-3 mt-1">
							<span class="text-xs text-[#444]">{formatDate(call.created_at)}</span>
							<span class="text-xs text-[#333]">{formatDuration(call.call_duration_seconds)}</span>
							{#if call.quality_score != null}
								<span class="text-xs font-medium {call.quality_score >= 8 ? 'text-[var(--accent)]' : call.quality_score >= 6 ? 'text-yellow-400' : 'text-red-400'}">{call.quality_score}/10</span>
							{/if}
						</div>
						{#if call.summary}
							<p class="text-xs text-[#666] mt-1 line-clamp-2">{call.summary}</p>
						{/if}
					</button>
				{/each}
			{/if}
		</div>

		<!-- Call detail -->
		<div class="flex-1 overflow-y-auto">
			{#if selected}
				<div class="p-8 max-w-3xl space-y-6">
					<!-- Header -->
					<div class="flex items-start justify-between">
						<div>
							<h3 class="text-white text-xl font-semibold">{selected.contact?.name ?? '—'}</h3>
							<p class="text-[#555] text-sm">{selected.contact?.company ?? ''} · {selected.contact?.phone ?? ''}</p>
							<p class="text-[#444] text-xs mt-1">{formatDate(selected.created_at)} · {formatDuration(selected.call_duration_seconds)}</p>
						</div>
						<div class="text-right">
							<span class="text-sm {outcomeColor(selected.outcome)}">
								{outcomeLabels[selected.outcome ?? ''] ?? 'No outcome'}
							</span>
							<a href="/contacts/{selected.contact?.id}"
								class="block text-xs text-[#555] hover:text-white mt-1 transition-colors">
								View contact →
							</a>
						</div>
					</div>

					<!-- Recording player -->
					{#if selected.recording_url && recordingUrl}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4">
							{#if recordingError}
								<p class="text-xs text-[#666]">Recording unavailable — it may still be processing or could not be found.</p>
							{:else}
								<audio controls src={recordingUrl} onerror={() => recordingError = true} class="w-full h-8 mt-2" style="filter: invert(0.7) sepia(0.2)"></audio>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
