<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/Icon.svelte';
	import { goto } from '$app/navigation';
	import { activeCall } from '$lib/stores/twilio';
	import { callState } from '$lib/stores';

	// Show only when a call is active AND we're NOT on the dialer page
	const isOnDialer = $derived(
		$page.url.pathname === '/dialer' || $page.url.pathname === '/phone'
	);
	const showBar = $derived(
		($callState === 'calling' || $callState === 'ringing') && !isOnDialer
	);

	let muted = $state(false);
	let duration = $state(0);
	let durationTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if ($callState === 'calling') {
			if (!durationTimer) {
				duration = 0;
				durationTimer = setInterval(() => duration++, 1000);
			}
		} else {
			if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
			if ($callState === 'idle') {
				duration = 0;
				muted = false;
			}
		}
	});

	function toggleMute() {
		const call = $activeCall;
		if (!call) return;
		try {
			muted = !muted;
			call.mute(muted);
		} catch {
			muted = !muted; // revert on error
		}
	}

	function endCall() {
		const call = $activeCall;
		if (call) {
			try { call.disconnect(); } catch { /* ignore */ }
		}
	}

	function goToDialer() {
		goto('/dialer');
	}

	function formatDuration(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

{#if showBar}
	<div
		class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[90]
		       flex items-center gap-3 px-4 py-3 rounded-2xl
		       bg-[#111] border border-[#2a2a2a]"
		style="box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);"
		role="status"
		aria-label="Active call controls"
	>
		<!-- Status indicator + duration -->
		<div class="flex items-center gap-2 min-w-[64px]">
			<span class="w-2 h-2 rounded-full flex-shrink-0 {$callState === 'ringing'
				? 'bg-yellow-500 animate-pulse'
				: 'bg-[var(--call)] animate-pulse'}"></span>
			{#if $callState === 'calling'}
				<span class="text-xs text-white font-mono tabular-nums">{formatDuration(duration)}</span>
			{:else}
				<span class="text-xs text-yellow-400">Ringing...</span>
			{/if}
		</div>

		<!-- Divider -->
		<div class="w-px h-5 bg-[#2a2a2a] flex-shrink-0"></div>

		<!-- Mute toggle -->
		<button
			onclick={toggleMute}
			title={muted ? 'Unmute' : 'Mute'}
			class="w-8 h-8 rounded-xl flex items-center justify-center transition-colors
			       {muted
			         ? 'bg-white/20 text-white'
			         : 'text-[#555] hover:text-white hover:bg-white/10'}"
		>
			<span class="text-sm">{muted ? '🔇' : '🎙️'}</span>
		</button>

		<!-- End call -->
		<button
			onclick={endCall}
			title="End call"
			class="w-8 h-8 rounded-xl bg-[var(--end)] hover:bg-[var(--end-hi)]
			       flex items-center justify-center transition-colors text-white font-bold text-sm"
		><Icon name="x" size={14} /></button>

		<!-- Divider -->
		<div class="w-px h-5 bg-[#2a2a2a] flex-shrink-0"></div>

		<!-- Go to dialer -->
		<button
			onclick={goToDialer}
			class="flex items-center gap-1 text-[10px] text-[#555] hover:text-white transition-colors"
		>
			<span>Dialer</span>
			<span>→</span>
		</button>
	</div>
{/if}
