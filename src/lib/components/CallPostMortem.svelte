<script lang="ts">
	import { apiFetch } from '$lib/api';
	import { BRAND } from '$lib/brand';
	import { onMount, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import TemplatePicker from '$lib/components/TemplatePicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import AppointmentModal from '$lib/components/AppointmentModal.svelte';
	import type { Contact } from '$lib/stores';

	// Appointment booking
	let showAppointmentModal = $state(false);
	const WIN_OUTCOMES_WITH_APPT = new Set([
		'appointment_set','demo_scheduled','meeting_confirmed','callback','follow_up_agreed','proposal_requested'
	]);

	interface SaveData { notes: string; outcome: string; }
	interface TaskSuggestion { title:string; description:string; taskType:string; priority:string; dueDate:string|null; aiSuggested:boolean; callId:string; }

	let { contact, transcript, summary, onSave, initialNotes = '', callId = null, initialOutcome = 'no_answer' }: {
		contact: Contact;
		transcript: string;
		summary: string;
		onSave: (data: SaveData) => Promise<void>;
		initialNotes?: string;
		callId?: string | null;
		initialOutcome?: string;
	} = $props();

	let notes = $state(initialNotes);
	// Bug 7: default to no_answer (conservative); Dialer passes left_voicemail when VM was dropped
	let outcome = $state(initialOutcome);
	let saving = $state(false);
	let flagging = $state(false);
	let flagged = $state(false);
	let flagNotes = $state('');
	let flagProduct = $state('');
	let showFlagForm = $state(false);

	// Quality scoring
	let qualityScore = $state<any>(null);
	let loadingScore = $state(false);

	async function loadScore() {
		if (!callId) return;
		loadingScore = true;
		try {
			// First try to read an already-computed score (triggerQualityScore in Dialer
			// fires a POST immediately after the call ends, so by the time the postmortem
			// mounts the score is often already written). Only POST if none exists yet.
			const existing = await apiFetch(`/api/calls/${callId}`);
			if (existing.ok) {
				const call = await existing.json();
				if (call.quality_score != null) {
					qualityScore = typeof call.quality_breakdown === 'object' && call.quality_breakdown !== null
						? call.quality_breakdown
						: { overallScore: call.quality_score };
					loadingScore = false;
					return;
				}
			}
			// No score yet — trigger scoring
			const scoreRes = await apiFetch(`/api/calls/${callId}/score`, { method: 'POST' });
			if (scoreRes.ok) qualityScore = await scoreRes.json();
		} catch { /* silent — scoring is non-critical */ }
		loadingScore = false;
	}

	async function flagForOwnPipeline() {
		flagging = true;
		const res = await apiFetch('/api/contacts/flag-own', {
			method: 'POST',
			body: JSON.stringify({ contactId: contact.id, flagged: !flagged, notes: flagNotes || null, product: flagProduct || null }),
		});
		if (res.ok) { flagged = !flagged; if (!flagged) { showFlagForm = false; flagNotes = ''; flagProduct = ''; } }
		flagging = false;
	}

	// Follow-up scheduler
	let followUpDate = $state('');
	let followUpType = $state('callback');
	let followUpNote = $state('');
	let schedulingFollowUp = $state(false);

	async function scheduleFollowUp() {
		if (!followUpDate || !contact?.id) return;
		schedulingFollowUp = true;
		await apiFetch('/api/tasks', {
			method: 'POST',
			body: JSON.stringify({
				title: followUpNote.trim() || `Follow up with ${contact.name ?? 'contact'}`,
				task_type: followUpType,
				priority: 'high',
				status: 'pending',
				due_date: new Date(followUpDate + 'T09:00:00').toISOString(),
				contact_id: contact?.id ?? null,
				notes: followUpNote || null,
			}),
		});
		followUpDate = '';
		followUpNote = '';
		schedulingFollowUp = false;
	}

	// AI Tasks
	let taskSuggestions = $state<TaskSuggestion[]>([]);
	let loadingTasks = $state(false);
	let acceptedTasks = $state<Set<number>>(new Set());

	// Collapsible section state
	let showAllOutcomes = $state(false);
	let showFollowUp = $state(false);
	let showAiTasks = $state(true);
	let showEmailGen = $state(false);

	// Email generation
	let emailType = $state('follow_up');
	let generatingEmail = $state(false);
	let generatedEmail = $state<{subject:string;body:string}|null>(null);
	let emailCopied = $state(false);
	let showEmail = $state(false);
	let sendingEmail = $state(false);
	let emailSentMsg = $state('');

	async function sendViaEdelhaus() {
		if (!generatedEmail || !contact?.email) return;
		sendingEmail = true; emailSentMsg = '';

		try {
			const res = await apiFetch('/api/emails/send', {
				method: 'POST',
				body: JSON.stringify({
					to: contact.email,
					subject: generatedEmail.subject,
					html: generatedEmail.body?.replace(/\n/g, '<br>') ?? generatedEmail.body,
					text: generatedEmail.body,
					contactId: contact.id,
					emailType: emailType ?? 'follow_up',
				}),
			});

			if (res.ok) {
				const d = await res.json();
				emailSentMsg = `✓ Sent from ${d.from ?? BRAND} via ${d.method === 'smtp' ? 'Gmail SMTP' : 'Resend'}`;
			} else {
				emailSentMsg = 'Send failed — check email accounts in Settings';
			}
		} catch {
			emailSentMsg = 'Network error — email not sent';
		}
		sendingEmail = false;
	}

	const CALL_OUTCOMES = [
		// Connected
		{ value: 'answered',           label: 'Answered',                  group: 'Connected' },
		{ value: 'left_voicemail',     label: 'Left Voicemail',            group: 'Connected' },
		// No Contact
		{ value: 'no_answer',          label: 'No Answer',                 group: 'No Contact' },
		{ value: 'busy',               label: 'Busy / Not Available',      group: 'No Contact' },
		{ value: 'wrong_number',       label: 'Wrong Number',              group: 'No Contact' },
		{ value: 'gatekeeper',         label: 'Gatekeeper / Blocked',      group: 'No Contact' },
		// Wins
		{ value: 'appointment_set',    label: 'Appointment Set',           group: 'Win' },
		{ value: 'demo_scheduled',     label: 'Demo Scheduled',            group: 'Win' },
		{ value: 'meeting_confirmed',  label: 'Meeting Confirmed',         group: 'Win' },
		{ value: 'callback',           label: 'Requested Callback',        group: 'Win' },
		{ value: 'info_requested',     label: 'Requested Info/Materials',  group: 'Win' },
		{ value: 'decision_maker',     label: 'Reached Decision Maker',    group: 'Win' },
		{ value: 'referral',           label: 'Gave a Referral',           group: 'Win' },
		{ value: 'follow_up_agreed',   label: 'Agreed to Follow Up',       group: 'Win' },
		{ value: 'proposal_requested', label: 'Requested Proposal',        group: 'Win' },
		{ value: 'trial_started',      label: 'Started Trial',             group: 'Win' },
		{ value: 'signed_up',          label: 'Signed Up / Converted',     group: 'Win' },
		{ value: 'investment_interest',label: 'Investment Interest',       group: 'Win' },
		// Dead
		{ value: 'not_interested',     label: 'Not Interested',            group: 'Dead' },
		{ value: 'do_not_call',        label: 'Do Not Call',               group: 'Dead' },
		{ value: 'disconnected',       label: 'Disconnected Number',       group: 'Dead' },
	];

	async function handleSave() {
		saving = true;
		// Capture before onSave clears the contact prop
		const capturedContactId = contact.id;
		const acceptedList = taskSuggestions.filter((_, i) => acceptedTasks.has(i));

		await onSave({ notes, outcome });

		// Save accepted AI tasks — use captured IDs since props may have cleared
		for (const task of acceptedList) {
			try {
				await apiFetch('/api/tasks', {
					method: 'POST',
					body: JSON.stringify({ ...task, contactId: capturedContactId }),
				});
			} catch { /* ignore */ }
		}

		saving = false;
		notes = '';
		outcome = initialOutcome;  // reset to prop default, not hardcoded 'answered'
	}

	async function suggestTasks() {
		loadingTasks = true;
		taskSuggestions = [];
		try {
			const res = await apiFetch('/api/tasks/suggest', {
				method: 'POST',
				body: JSON.stringify({
					contactName: contact.name,
					contactCompany: contact.company,
					outcome,
					summary: summary || undefined,
					transcript: transcript || undefined,
				}),
			});
			if (res.ok) {
				const data = await res.json();
				taskSuggestions = data.suggestions ?? [];
			}
		} catch { /* ignore */ }
		loadingTasks = false;
	}

	async function applyEmailTemplate(subject: string, body: string, _id: string) {
		generatedEmail = { subject, body };
		showEmail = true;
	}

	async function generateEmail() {
		generatingEmail = true;
		generatedEmail = null;
		try {
			const res = await apiFetch('/api/emails/generate', {
				method: 'POST',
				body: JSON.stringify({
					contactId: contact.id,
					contactName: contact.name,
					contactEmail: contact.email,
					contactCompany: contact.company,
					emailType,
					summary: summary || undefined,
					transcript: transcript || undefined,
				}),
			});
			if (res.ok) {
				generatedEmail = await res.json();
				showEmail = true;
			}
		} catch { /* ignore */ }
		generatingEmail = false;
	}

	function copyEmail() {
		if (!generatedEmail) return;
		navigator.clipboard.writeText(`Subject: ${generatedEmail.subject}\n\n${generatedEmail.body}`);
		emailCopied = true;
		setTimeout(() => emailCopied = false, 2000);
	}

	function openMailto() {
		if (!generatedEmail || !contact.email) return;
		const url = `mailto:${contact.email}?subject=${encodeURIComponent(generatedEmail.subject)}&body=${encodeURIComponent(generatedEmail.body)}`;
		window.open(url);
	}

	function toggleTask(i: number) {
		const next = new Set(acceptedTasks);
		if (next.has(i)) next.delete(i); else next.add(i);
		acceptedTasks = next;
	}

	// Keyboard shortcut: 1-5 sets outcome
	let outcomeShortcutHandler: (e: Event) => void;

	// Auto-suggest tasks + load quality score when postmortem opens
	onMount(() => {
		if ((summary || transcript) && callId) {
			loadScore();
			suggestTasks();
		} else if (summary || transcript) {
			suggestTasks();
		}

		outcomeShortcutHandler = (e: Event) => {
			const val = (e as CustomEvent).detail;
			if (typeof val === 'string' && val) {
				outcome = val;
			}
		};
		window.addEventListener('leados:set-outcome', outcomeShortcutHandler);
	});

	onDestroy(() => {
		if (outcomeShortcutHandler) {
			window.removeEventListener('leados:set-outcome', outcomeShortcutHandler);
		}
	});
</script>

<div class="rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-surface-1)] flex flex-col max-h-[90vh]">

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto p-6 space-y-5">

		<!-- Contact header -->
		<div class="flex items-center justify-between gap-3">
			<div>
				<h3 class="text-white font-semibold">{contact.name}</h3>
				<p class="text-[var(--c-text-secondary)] text-sm">{contact.company ?? ''}</p>
			</div>
			{#if outcome}
				<span class="text-[10px] px-2 py-1 rounded-lg border shrink-0
					{outcome === 'appointment_set' || outcome === 'demo_scheduled' || outcome === 'meeting_confirmed' || outcome === 'signed_up' ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' :
					 outcome === 'not_interested' || outcome === 'do_not_call' || outcome === 'disconnected' ? 'border-red-800/40 bg-red-950/20 text-red-400' :
					 'border-[var(--c-border)] text-[var(--c-text-muted)]'}">
					{CALL_OUTCOMES.find(o => o.value === outcome)?.label ?? outcome.replace(/_/g,' ')}
				</span>
			{/if}
		</div>

		<!-- ── QUICK-LOG — one tap to log and advance ── -->
		<div>
			<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.18em;color:var(--c-text-faint)" class="mb-2">Log Outcome</p>
			<!-- Primary 4 — cover ~85% of all calls -->
			<div class="grid grid-cols-2 gap-2 mb-2">
				{#each [
					{ value: 'left_voicemail',  label: 'Voicemail',       emoji: '📬', cls: 'border-[#1e1e1e] text-[#888] hover:border-blue-800 hover:text-blue-400' },
					{ value: 'no_answer',       label: 'No Answer',       emoji: '📵', cls: 'border-[#1e1e1e] text-[#888] hover:border-[#333] hover:text-white' },
					{ value: 'appointment_set', label: 'Appointment Set', emoji: '📅', cls: 'border-[var(--accent)]/40 text-[var(--accent)] hover:border-[var(--accent-hi)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/12' },
					{ value: 'not_interested',  label: 'Not Interested',  emoji: '✕',  cls: 'border-[#1e1e1e] text-[#7c7c7c] hover:border-red-900/40 hover:text-red-500' },
				] as q}
					<button
						onclick={() => outcome = q.value}
						class="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all {q.cls}
							{outcome === q.value ? '!border-white !text-white !bg-white/5' : ''}">
						<span class="text-sm leading-none shrink-0">{q.emoji}</span>
						<span class="truncate">{q.label}</span>
						{#if outcome === q.value}<span class="ml-auto text-[10px]">✓</span>{/if}
					</button>
				{/each}
			</div>
			<!-- More outcomes toggle -->
			<button onclick={() => showAllOutcomes = !showAllOutcomes}
				class="w-full text-[10px] text-[var(--c-text-faint)] hover:text-white transition-colors py-1 flex items-center justify-center gap-1">
				{showAllOutcomes ? '▲ Fewer options' : '▾ More outcomes'}
			</button>
			{#if showAllOutcomes}
				<div class="mt-2 space-y-1" transition:slide={{ duration: 120 }}>
					{#each ['Connected','No Contact','Win','Dead'] as group}
						{@const groupOutcomes = CALL_OUTCOMES.filter(o => o.group === group &&
							!['left_voicemail','no_answer','appointment_set','not_interested'].includes(o.value))}
						{#if groupOutcomes.length}
							<p class="text-[9px] text-[var(--c-text-ghost)] uppercase tracking-widest px-1 pt-1">{group}</p>
							<div class="flex flex-wrap gap-1.5">
								{#each groupOutcomes as o}
									<button
										onclick={() => outcome = o.value}
										class="rounded-lg border px-2.5 py-1.5 text-xs transition-colors
											{outcome === o.value ? 'border-white bg-white/5 text-white' :
											 group === 'Win' ? 'border-[var(--accent)]/40 text-[var(--accent)] hover:text-[var(--accent)] hover:border-[var(--accent-hi)]' :
											 group === 'Dead' ? 'border-red-900/30 text-[#7c7c7c] hover:text-red-500 hover:border-red-900/50' :
											 'border-[#1e1e1e] text-[#7c7c7c] hover:border-[#333] hover:text-white'}">
										{o.label}
									</button>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- Notes — above the fold, not buried -->
		<div>
			<label class="block mb-1.5" style="font-family:var(--font-label);font-size:9px;letter-spacing:.18em;color:var(--c-text-faint)">Notes</label>
			<textarea bind:value={notes} rows="2" placeholder="Quick note…"
				class="w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)] px-4 py-3 text-sm text-white placeholder-[var(--c-text-ghost)] focus:border-white focus:outline-none resize-none">
			</textarea>
		</div>

		<!-- Summary + transcript -->
		{#if summary}
			<div class="rounded-lg bg-[var(--c-surface-2)] border border-[var(--c-border-subtle)] p-4">
				<p class="text-xs text-[var(--c-text-muted)] uppercase tracking-widest mb-2">AI Summary</p>
				<p class="text-sm text-[var(--c-text-secondary)]">{summary}</p>
			</div>
		{/if}

		{#if transcript}
			<div>
				<p class="text-xs text-[var(--c-text-muted)] uppercase tracking-widest mb-2">Transcript</p>
				<div class="rounded-lg bg-[var(--c-surface-2)] border border-[var(--c-border-subtle)] p-4 h-32 overflow-y-auto">
					<p class="text-xs text-[var(--c-text-muted)] whitespace-pre-wrap" style="font-family: var(--font-mono)">{transcript}</p>
				</div>
			</div>
		{/if}

		<!-- Quality score — color-accented border -->
		{#if qualityScore}
			<div class="rounded-lg border p-4 {qualityScore.overallScore >= 80 ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12' : qualityScore.overallScore >= 60 ? 'border-yellow-900/50 bg-yellow-950/10' : 'border-red-900/50 bg-red-950/10'}">
				<div class="flex items-center justify-between mb-3">
					<p class="text-xs text-[var(--c-text-muted)] uppercase tracking-widest">Call Quality</p>
					<div class="flex items-center gap-2">
						<span class="font-mono text-white font-bold text-lg">{qualityScore.overallScore}</span>
						<span class="text-[var(--c-text-ghost)] text-sm">/100</span>
						<span class="text-xs px-2 py-0.5 rounded-full ml-1 {qualityScore.overallScore >= 80 ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : qualityScore.overallScore >= 60 ? 'bg-yellow-950 text-yellow-400' : 'bg-red-950 text-red-400'}">
							{qualityScore.overallScore >= 80 ? 'Strong' : qualityScore.overallScore >= 60 ? 'Good' : qualityScore.overallScore >= 40 ? 'Fair' : 'Needs Work'}
						</span>
					</div>
				</div>
				{#if qualityScore.coachingNote}
					<p class="text-sm text-[var(--c-text-secondary)] mb-3">💡 {qualityScore.coachingNote}</p>
				{/if}
				<div class="grid grid-cols-3 gap-3 text-center">
					<div>
						<p class="text-xs text-[var(--c-text-faint)] mb-0.5">Talk ratio</p>
						<p class="text-sm text-white font-mono">{qualityScore.talkListenRatio}%</p>
					</div>
					<div>
						<p class="text-xs text-[var(--c-text-faint)] mb-0.5">Questions</p>
						<p class="text-sm text-white font-mono">{qualityScore.discoveryQuestions}</p>
					</div>
					<div>
						<p class="text-xs text-[var(--c-text-faint)] mb-0.5">Sentiment</p>
						<p class="text-sm text-white capitalize">{qualityScore.sentimentArc}</p>
					</div>
				</div>
			</div>
		{:else if loadingScore}
			<div class="rounded-lg bg-[var(--c-surface-2)] border border-[var(--c-border-subtle)] p-4 flex items-center gap-2">
				<div class="w-3 h-3 rounded-full bg-[var(--c-text-ghost)] animate-pulse"></div>
				<p class="text-xs text-[var(--c-text-faint)]">Analyzing call quality…</p>
			</div>
		{/if}

		<!-- Follow-up scheduler — collapsible -->
		<div class="rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-surface-1)]">
			<button onclick={() => showFollowUp = !showFollowUp}
				class="w-full flex items-center justify-between px-4 py-3 text-xs text-[var(--c-text-muted)] uppercase tracking-widest hover:text-white transition-colors">
				<span>Schedule Follow-up</span>
				<span>{showFollowUp ? '▲' : '▼'}</span>
			</button>
			{#if showFollowUp}
				<div class="px-4 pb-4 space-y-2" transition:slide={{ duration: 150 }}>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class="text-xs text-[var(--c-text-faint)] block mb-1">Date *</label>
							<DatePicker bind:value={followUpDate} onchange={(v) => followUpDate = v} min={new Date().toISOString().slice(0,10)} />
						</div>
						<div>
							<label class="text-xs text-[var(--c-text-faint)] block mb-1">Type</label>
							<select bind:value={followUpType} class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white focus:outline-none">
								<option value="callback">Callback</option>
								<option value="call">Call</option>
								<option value="email">Email</option>
								<option value="demo">Demo</option>
								<option value="follow_up">Follow-up</option>
							</select>
						</div>
					</div>
					<input bind:value={followUpNote} placeholder="Note (optional)"
						class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white placeholder-[var(--c-text-ghost)] focus:border-white focus:outline-none" />
					<button onclick={scheduleFollowUp} disabled={!followUpDate || schedulingFollowUp}
						class="rounded-lg border border-[var(--c-border-subtle)] px-4 py-2 text-xs text-[var(--c-text-muted)] hover:border-white hover:text-white transition-colors disabled:opacity-40">
						{schedulingFollowUp ? 'Scheduling...' : '+ Schedule Follow-up'}
					</button>
				</div>
			{/if}
		</div>

		<!-- AI Follow-up Tasks — collapsible, defaults open -->
		<div class="rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-surface-1)]">
			<div class="flex items-center justify-between px-4 py-3">
				<button onclick={() => showAiTasks = !showAiTasks}
					class="flex items-center gap-2 text-xs text-[var(--c-text-muted)] uppercase tracking-widest hover:text-white transition-colors">
					<span>AI Follow-up Tasks</span>
					<span>{showAiTasks ? '▲' : '▼'}</span>
				</button>
				<button onclick={suggestTasks} disabled={loadingTasks}
					class="rounded px-3 py-1 text-xs border border-[var(--c-border-subtle)] text-[var(--c-text-muted)] hover:border-white hover:text-white disabled:opacity-40 transition-colors">
					{loadingTasks ? 'Thinking...' : taskSuggestions.length ? 'Regenerate' : 'Suggest Tasks'}
				</button>
			</div>
			{#if showAiTasks}
				<div class="px-4 pb-4 space-y-2" transition:slide={{ duration: 150 }}>
					{#if taskSuggestions.length > 0}
						{#each taskSuggestions as task, i}
							<label class="flex items-start gap-2 cursor-pointer">
								<input type="checkbox" checked={acceptedTasks.has(i)} onchange={() => toggleTask(i)} class="mt-0.5 rounded" />
								<div class="flex-1">
									<p class="text-xs text-white">{task.title}</p>
									{#if task.description}<p class="text-xs text-[var(--c-text-faint)]">{task.description}</p>{/if}
									<p class="text-xs text-[var(--c-text-ghost)] capitalize">{task.taskType?.replace(/_/g,' ')} · {task.priority} priority</p>
								</div>
							</label>
						{/each}
						{#if acceptedTasks.size > 0}
							<p class="text-xs text-[var(--accent)]">{acceptedTasks.size} task{acceptedTasks.size !== 1 ? 's' : ''} will be created on save</p>
						{/if}
					{:else if !loadingTasks}
						<p class="text-xs text-[var(--c-text-ghost)]">Click "Suggest Tasks" to generate AI follow-up recommendations.</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Generate Email — collapsible -->
		<div class="rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-surface-1)]">
			<button onclick={() => showEmailGen = !showEmailGen}
				class="w-full flex items-center justify-between px-4 py-3 text-xs text-[var(--c-text-muted)] uppercase tracking-widest hover:text-white transition-colors">
				<span>Generate Follow-up Email</span>
				<span>{showEmailGen ? '▲' : '▼'}</span>
			</button>
			{#if showEmailGen || generatedEmail}
				<div class="px-4 pb-4 space-y-3" transition:slide={{ duration: 150 }}>
					<div class="flex gap-2 flex-wrap">
						<TemplatePicker type="email" onSelect={applyEmailTemplate} />
						<select bind:value={emailType} class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-xs text-white focus:outline-none">
							<option value="follow_up">Follow-up</option>
							<option value="intro">Introduction</option>
							<option value="proposal">Proposal</option>
							<option value="check_in">Check-in</option>
							<option value="break_up">Break-up</option>
						</select>
						<button onclick={generateEmail} disabled={generatingEmail}
							class="rounded-lg border border-[var(--c-border-subtle)] px-4 py-2 text-xs text-[var(--c-text-muted)] hover:border-white hover:text-white transition-colors disabled:opacity-40">
							{generatingEmail ? 'Writing...' : generatedEmail ? 'Regenerate' :
							'Generate Email'}
						</button>
					</div>
					{#if generatedEmail}
						<div class="space-y-2">
							<input bind:value={generatedEmail.subject} placeholder="Subject"
								class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
							<textarea bind:value={generatedEmail.body} rows="4"
								class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white focus:border-white focus:outline-none resize-none"></textarea>
						</div>
					{/if}
				</div>
			{/if}
		</div>

	</div><!-- /scrollable -->

	<!-- Footer — save + book appointment -->
	<div class="flex-shrink-0 border-t border-[var(--c-border)] px-6 py-4 space-y-3">
		<!-- Book Appointment button — shows for win outcomes -->
		{#if WIN_OUTCOMES_WITH_APPT.has(outcome)}
			<button onclick={() => showAppointmentModal = true}
				class="w-full rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 py-2.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-hi)] transition-colors flex items-center justify-center gap-2">
				📅 Book Appointment / Qualifying Questions
			</button>
		{/if}
		<div class="flex gap-3">
			<button onclick={handleFlag} class="rounded-lg border border-[var(--c-border-subtle)] px-4 py-2.5 text-xs text-[var(--c-text-muted)] hover:border-white hover:text-white transition-colors">
				{flagged ? '⚑ Flagged' : 'Flag'}
			</button>
			<button onclick={handleSave} disabled={saving}
				class="flex-1 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
				{saving ? 'Saving...' : 'Log Call'}
			</button>
		</div>
	</div>

</div>

<!-- Appointment Modal -->
{#if showAppointmentModal}
	<AppointmentModal
		{contact}
		callId={callId}
		campaignId={null}
		onClose={() => showAppointmentModal = false}
		onSaved={() => { showAppointmentModal = false; }}
	/>
{/if}
