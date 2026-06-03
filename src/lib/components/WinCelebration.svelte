<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let {
		contactName = '',
		outcome = 'appointment_set',
		onDone,
	}: {
		contactName?: string;
		outcome?: string;
		onDone: () => void;
	} = $props();

	const WIN_LABELS: Record<string, { headline: string; sub: string; color: string }> = {
		appointment_set:   { headline: 'Appointment Set',   sub: 'That\'s money.',        color: '#22c55e' },
		demo_scheduled:    { headline: 'Demo Scheduled',    sub: 'Close it.',              color: '#3b82f6' },
		meeting_confirmed: { headline: 'Meeting Confirmed', sub: 'Show up.',               color: '#a855f7' },
		signed_up:         { headline: 'Signed Up',         sub: 'Full send.',             color: '#f59e0b' },
		callback:          { headline: 'Callback Set',      sub: 'They\'re interested.',   color: '#06b6d4' },
	};

	const win = WIN_LABELS[outcome] ?? WIN_LABELS['appointment_set'];

	let visible = $state(true);

	// Auto-dismiss after 1.8s
	setTimeout(() => {
		visible = false;
		setTimeout(onDone, 400);
	}, 1800);
</script>

{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
		style="background:#000;cursor:pointer"
		onclick={() => { visible = false; setTimeout(onDone, 300); }}
		transition:fade={{ duration: 350 }}
	>
		<!-- Subtle animated grid background -->
		<div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
			<div style="
				position:absolute;inset:0;
				background-image:linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px);
				background-size:60px 60px;
			"></div>
		</div>

		<!-- Content -->
		<div class="relative text-center px-8 max-w-2xl mx-auto">
			<!-- Win label -->
			<div
				in:scale={{ start: 0.92, duration: 500, easing: cubicOut, delay: 80 }}
				style="font-family:var(--font-label,'Cormorant SC',serif);font-size:11px;letter-spacing:.28em;color:{win.color};margin-bottom:20px;opacity:.9"
			>
				{win.headline}
			</div>

			<!-- Contact name — the hero moment -->
			{#if contactName}
				<div
					in:scale={{ start: 0.88, duration: 600, easing: cubicOut, delay: 120 }}
					style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2.8rem,8vw,6rem);letter-spacing:-.02em;line-height:.9;color:#fff;margin-bottom:20px"
				>
					{contactName}
				</div>
			{/if}

			<!-- Sub line -->
			<div
				in:fade={{ duration: 400, delay: 400 }}
				style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-style:italic;font-size:clamp(1rem,3vw,1.5rem);color:#333;letter-spacing:.02em"
			>
				{win.sub}
			</div>
		</div>

		<!-- Tap to dismiss hint -->
		<div
			in:fade={{ duration: 300, delay: 900 }}
			style="position:absolute;bottom:32px;font-size:9px;letter-spacing:.18em;color:#222;font-family:var(--font-label,'Cormorant SC',serif)"
		>
			TAP TO CONTINUE
		</div>
	</div>
{/if}
