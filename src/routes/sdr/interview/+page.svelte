<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	const QUESTIONS = [
		"Tell me about yourself and your sales background — why do you do this?",
		"Walk me through how you handle a gatekeeper who tells you the decision-maker is in a meeting.",
		"You've just heard 'We already use a competitor and we're happy.' What do you say next?",
		"What's your process for doing research on a prospect before you call?",
		"Describe your best quarter. What were you doing differently that made it work?",
	];

	let tier = $state<string>('free');
	interface Answer { question_index: number; transcript: string | null; score: number | null; feedback: string | null; recording_url: string | null; }
	let answers = $state<Answer[]>([]);
	let profile = $state<any>(null);
	let activeQ = $state(0);
	let recording = $state(false);
	let mediaRecorder = $state<MediaRecorder | null>(null);
	let chunks = $state<Blob[]>([]);
	let audioUrl = $state<string | null>(null);
	let transcript = $state('');
	let submitting = $state(false);
	let loading = $state(true);
	let stream = $state<MediaStream | null>(null);
	let recordingSeconds = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;

	const currentAnswer = $derived(answers.find(a => a.question_index === activeQ) ?? null);
	const completedCount = $derived(answers.filter(a => a.score !== null).length);
	const overallScore = $derived(
		completedCount > 0
			? Math.round(answers.filter(a => a.score !== null).reduce((s, a) => s + (a.score ?? 0), 0) / completedCount)
			: null
	);

	onMount(async () => {
		const tierRes = await apiFetch('/api/portal/tier');
		if (tierRes.ok) { const d = await tierRes.json(); tier = d.tier; }
		const [intRes, profRes] = await Promise.all([
			apiFetch('/api/rep-profile/interview'),
			apiFetch('/api/rep-profile'),
		]);
		if (intRes.ok) { const d = await intRes.json(); answers = d.answers ?? []; }
		if (profRes.ok) profile = await profRes.json();
		loading = false;
	});

	onDestroy(() => {
		stopRecording();
		if (stream) stream.getTracks().forEach(t => t.stop());
	});

	async function startRecording() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			chunks = [];
			audioUrl = null;
			transcript = '';
			mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks = [...chunks, e.data]; };
			mediaRecorder.onstop = () => {
				const blob = new Blob(chunks, { type: 'audio/webm' });
				audioUrl = URL.createObjectURL(blob);
			};
			mediaRecorder.start();
			recording = true;
			recordingSeconds = 0;
			timer = setInterval(() => recordingSeconds++, 1000);
		} catch {
			toastError('Microphone access denied');
		}
	}

	function stopRecording() {
		if (mediaRecorder && recording) { mediaRecorder.stop(); recording = false; }
		if (timer) { clearInterval(timer); timer = null; }
		if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
	}

	function fmtTime(s: number) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

	async function submitAnswer() {
		submitting = true;
		try {
			const res = await apiFetch('/api/rep-profile/interview', {
				method: 'POST',
				body: JSON.stringify({ questionIndex: activeQ, transcript: transcript.trim() || null }),
			});
			if (res.ok) {
				const d = await res.json();
				answers = [...answers.filter(a => a.question_index !== activeQ), d];
				toastSuccess(`Question ${activeQ + 1} scored: ${d.score}/100`);
				if (activeQ < QUESTIONS.length - 1) activeQ++;
			} else { toastError('Submission failed'); }
		} catch { toastError('Submission failed'); }
		submitting = false;
	}
</script>

<svelte:head><title>AI Interview — Edelhaus SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto">
	<div class="mb-6">
		<h2 class="text-white text-xl font-semibold">AI Interview</h2>
		<p class="text-xs text-[#7c7c7c] mt-1">
			Answer 5 questions — recorded or typed. Claude scores your tone, structure, and sales instinct.
			Score ≥ 70 unlocks Live Roleplay on your profile.
		</p>
	</div>

	{#if loading}
		<div class="space-y-3">{#each [1,2,3] as _}<div class="h-16 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>
	{:else if tier === 'free'}
		<div class="rounded-xl border border-yellow-800/40 bg-yellow-950/10 p-6 text-center space-y-3">
			<p class="text-3xl">🔒</p>
			<p class="text-white font-semibold">AI Interview is a Pro feature</p>
			<p class="text-xs text-[#8a8a8a] leading-relaxed">Complete your AI interview to earn your score badge and unlock Live Roleplay certification. Available on Pro and Agency plans.</p>
			<a href="/#pricing" target="_blank" class="inline-block rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">Upgrade to Pro →</a>
		</div>
	{:else}

		<!-- Overall progress -->
		{#if completedCount > 0}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-6 flex items-center gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div>
					<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-1">Interview Score</p>
					<p class="text-3xl font-bold {overallScore && overallScore >= 85 ? 'text-[var(--accent)]' : overallScore && overallScore >= 70 ? 'text-yellow-400' : 'text-white'}">{overallScore ?? '—'}</p>
				</div>
				<div class="flex-1">
					<div class="flex gap-1 mb-2">
						{#each QUESTIONS as _, i}
							<div class="flex-1 h-1.5 rounded-full {answers.find(a => a.question_index === i)?.score !== null ? 'bg-[var(--accent)]' : 'bg-[#2a2a2a]'}"></div>
						{/each}
					</div>
					<p class="text-xs text-[#7c7c7c]">{completedCount}/{QUESTIONS.length} questions answered</p>
					{#if completedCount === QUESTIONS.length && overallScore && overallScore >= 70}
						<p class="text-xs text-[var(--accent)] mt-1">🎯 Live Roleplay unlocked!</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Question tabs -->
		<div class="flex gap-1 mb-4">
			{#each QUESTIONS as _, i}
				{@const done = answers.find(a => a.question_index === i)?.score !== null}
				<button onclick={() => { activeQ = i; audioUrl = null; transcript = ''; }}
					class="flex-1 py-2 rounded-lg text-xs font-medium transition-colors {activeQ === i ? 'bg-white text-black' : done ? 'bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/40' : 'bg-[#111] text-[#7c7c7c] border border-[#2a2a2a] hover:border-white hover:text-white'}">
					{done ? '✓' : i + 1}
				</button>
			{/each}
		</div>

		<!-- Current question -->
		<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-6 space-y-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
			<p class="text-white font-medium leading-relaxed">"{QUESTIONS[activeQ]}"</p>

			<!-- Previous score if answered -->
			{#if currentAnswer?.score !== null && currentAnswer?.score !== undefined}
				<div class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-3">
					<div class="flex items-center gap-2 mb-1">
						<p class="text-lg font-bold text-[var(--accent)]">{currentAnswer.score}/100</p>
						<p class="text-xs text-[#7c7c7c]">Claude's score</p>
					</div>
					{#if currentAnswer.feedback}<p class="text-xs text-[#888]">{currentAnswer.feedback}</p>{/if}
				</div>
			{/if}

			<!-- Recording controls -->
			<div class="space-y-3">
				<p class="text-xs text-[#7c7c7c] uppercase tracking-widest">Record Your Answer</p>
				{#if !recording && !audioUrl}
					<button onclick={startRecording}
						class="rounded-lg border border-red-800/40 bg-red-950/10 text-red-400 px-4 py-2.5 text-xs hover:bg-red-950/20 transition-colors flex items-center gap-2">
						🎙 Start Recording
					</button>
				{:else if recording}
					<div class="flex items-center gap-3">
						<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
						<span class="text-red-400 text-sm font-mono">{fmtTime(recordingSeconds)}</span>
						<button onclick={stopRecording}
							class="rounded-lg bg-red-600 text-white px-4 py-2 text-xs hover:bg-red-500 transition-colors">
							Stop
						</button>
					</div>
				{:else if audioUrl}
					<div class="space-y-2">
						<audio src={audioUrl} controls class="w-full h-8"></audio>
						<button onclick={() => { audioUrl = null; chunks = []; }}
							class="text-xs text-[#6e6e6e] hover:text-white transition-colors mt-1">
							Discard & Re-record
						</button>
					</div>
				{/if}
			</div>

			<!-- Typed answer + submit -->
			<div class="space-y-3 pt-3 border-t border-[#1e1e1e]">
				<p class="text-xs text-[#7c7c7c] uppercase tracking-widest">Your answer</p>
				<textarea bind:value={transcript} rows="5" placeholder="Type your answer here (or transcribe what you recorded)…"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
				<button onclick={submitAnswer} disabled={submitting || !transcript.trim()}
					class="w-full rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40 transition-colors">
					{submitting ? 'Scoring…' : (currentAnswer?.score != null ? 'Resubmit answer' : 'Submit answer')}
				</button>
				<p class="text-[10px] text-[#6e6e6e]">Claude scores your typed answer; the recording is for your own review.</p>
			</div>
		</div>
{/if}
</div>
