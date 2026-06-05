<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { incomingCall, answerIncomingCall, rejectIncomingCall } from '$lib/stores/twilio';

	const isOnDialer = $derived($page.url.pathname === '/dialer');

	// Ringing animation tick — cycles 0→1→2→0 for any CSS that wants it
	let ringCount = $state(0);
	let ringTimer: ReturnType<typeof setInterval> | null = null;

	// Countdown to auto-voicemail (Twilio's own 30s timeout on the TwiML <Dial>)
	let timeLeft = $state(30);
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if ($incomingCall) {
			ringCount = 0;
			timeLeft = 30;

			ringTimer = setInterval(() => {
				ringCount = (ringCount + 1) % 3;
			}, 800);

			countdownTimer = setInterval(() => {
				timeLeft = Math.max(0, timeLeft - 1);
			}, 1000);
		} else {
			if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
			if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
			timeLeft = 30;
		}
	});

	function handleAnswer() {
		answerIncomingCall();
		if (!isOnDialer) {
			goto('/dialer?incoming=1');
		}
	}

	function handleReject() {
		rejectIncomingCall();
	}

	function formatNumber(num: string): string {
		if (!num) return '';
		const digits = num.replace(/\D/g, '');
		if (digits.length === 11 && digits.startsWith('1')) {
			return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
		}
		if (digits.length === 10) {
			return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
		}
		return num;
	}
</script>

{#if $incomingCall}
	{@const info = $incomingCall}
	<!-- Fixed banner: top-right, z-[100] clears sidebar (z-50) and overlay (z-40) -->
	<div
		class="fixed top-4 right-4 z-[100] w-80 rounded-2xl bg-[#111] border border-[#2a2a2a] overflow-hidden"
		style="box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05);"
		role="alertdialog"
		aria-label="Incoming call"
	>
		<!-- Animated top accent bar -->
		<div class="h-0.5 bg-gradient-to-r from-transparent via-[var(--call)] to-transparent"
			style="animation: banner-pulse 0.8s ease-in-out infinite;"></div>

		<!-- Header row -->
		<div class="px-4 pt-3 pb-1 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 rounded-full bg-[var(--call)] animate-pulse"></span>
				<p class="text-[10px] text-[var(--call)] font-semibold uppercase tracking-widest">Incoming Call</p>
			</div>
			<p class="text-[10px] text-[#444] font-mono tabular-nums">{timeLeft}s</p>
		</div>

		<!-- Caller info -->
		<div class="px-4 pb-3">
			<p class="text-white font-bold text-base leading-tight truncate">
				{info.contactName ?? formatNumber(info.from)}
			</p>
			{#if info.contactName}
				<p class="text-[#555] text-xs font-mono mt-0.5">{formatNumber(info.from)}</p>
			{/if}
			{#if info.to}
				<p class="text-[#333] text-[10px] mt-1 truncate">→ {formatNumber(info.to)}</p>
			{/if}
		</div>

		<!-- Answer / Reject buttons -->
		<div class="grid grid-cols-2 border-t border-[#1a1a1a]">
			<!-- Decline -->
			<button
				onclick={handleReject}
				class="flex flex-col items-center gap-1 py-3 text-[var(--end-text)] hover:bg-[var(--end)]/12 transition-colors border-r border-[#1a1a1a] cursor-pointer"
			>
				<span class="text-xl leading-none">⊘</span>
				<span class="text-[10px] font-medium">Decline</span>
				<span class="text-[9px] text-[#333]">→ Voicemail</span>
			</button>

			<!-- Answer -->
			<button
				onclick={handleAnswer}
				class="flex flex-col items-center gap-1 py-3 text-[var(--call)] hover:bg-[var(--call)]/12 transition-colors cursor-pointer"
			>
				<span class="text-xl leading-none">✆</span>
				<span class="text-[10px] font-medium">Answer</span>
				{#if isOnDialer}
					<span class="text-[9px] text-[#333]">Pick up</span>
				{:else}
					<span class="text-[9px] text-[#333]">→ Opens Dialer</span>
				{/if}
			</button>
		</div>

		<!-- Time-remaining progress bar -->
		<div class="h-0.5 bg-[#1a1a1a] relative overflow-hidden">
			<div
				class="h-full bg-yellow-600/50 transition-all duration-1000 ease-linear"
				style="width: {(timeLeft / 30) * 100}%;"
			></div>
		</div>
	</div>
{/if}

<style>
	@keyframes banner-pulse {
		0%, 100% { opacity: 0.3; }
		50%       { opacity: 1; }
	}
</style>
