<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { callState, currentContact } from '$lib/stores';

	let showHelp = $state(false);
	let gPressed = $state(false);
	let gTimer: ReturnType<typeof setTimeout> | null = null;

	const shortcuts = [
		{ keys: ['⌘K', 'Ctrl+K'], action: 'Global search', context: 'Global' },
		{ keys: ['?'], action: 'Show shortcuts', context: 'Global' },
		{ keys: ['G → D'], action: 'Go to Power Dialer', context: 'Global' },
		{ keys: ['G → C'], action: 'Go to Contacts', context: 'Global' },
		{ keys: ['G → P'], action: 'Go to Pipeline', context: 'Global' },
		{ keys: ['G → T'], action: 'Go to Tasks', context: 'Global' },
		{ keys: ['G → A'], action: 'Go to Analytics', context: 'Global' },
		{ keys: ['G → L'], action: 'Go to Lead Inbox', context: 'Global' },
		{ keys: ['G → S'], action: 'Go to Scripts', context: 'Global' },
		{ keys: ['Space'], action: 'Dial / End Call', context: 'Dialer' },
		{ keys: ['N'], action: 'Next contact (skip)', context: 'Dialer' },
		{ keys: ['1'], action: 'Outcome: Answered', context: 'Dialer (postmortem)' },
		{ keys: ['2'], action: 'Outcome: Voicemail', context: 'Dialer (postmortem)' },
		{ keys: ['3'], action: 'Outcome: No Answer', context: 'Dialer (postmortem)' },
		{ keys: ['4'], action: 'Outcome: Callback', context: 'Dialer (postmortem)' },
		{ keys: ['5'], action: 'Outcome: Not Interested', context: 'Dialer (postmortem)' },
		{ keys: ['Esc'], action: 'Close modals / cancel', context: 'Global' },
	];

	function handleKey(e: KeyboardEvent) {
		// Ignore if typing in input/textarea
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
		if (e.metaKey || e.ctrlKey) return; // let browser/search handle Ctrl+K

		const inDialer = $page.url.pathname.startsWith('/dialer');
		const cs = $callState;

		// ? = show help
		if (e.key === '?') { showHelp = !showHelp; return; }
		if (e.key === 'Escape') {
			showHelp = false;
			// Cancel ringing call
			if (inDialer && cs === 'ringing') {
				window.dispatchEvent(new CustomEvent('leados:end-call'));
			}
			return;
		}

		// G → navigation shortcuts
		if (e.key === 'g' || e.key === 'G') {
			gPressed = true;
			if (gTimer) clearTimeout(gTimer);
			gTimer = setTimeout(() => { gPressed = false; }, 1000);
			return;
		}
		if (gPressed) {
			gPressed = false;
			if (gTimer) clearTimeout(gTimer);
			const goMap: Record<string, string> = { d: '/dialer', c: '/contacts', p: '/pipeline', t: '/tasks', a: '/analytics', l: '/leads-inbox', s: '/scripts' };
			const dest = goMap[e.key.toLowerCase()];
			if (dest) { e.preventDefault(); goto(dest); }
			return;
		}

		// Dialer-specific shortcuts
		if (inDialer) {
			if (e.key === ' ') {
				e.preventDefault();
				if (cs === 'idle' && $currentContact) {
					// Trigger dial — dispatch custom event that Dialer listens to
					window.dispatchEvent(new CustomEvent('leados:dial'));
				} else if (cs === 'calling') {
					window.dispatchEvent(new CustomEvent('leados:end-call'));
				}
				return;
			}
			if (e.key === 'n' || e.key === 'N') {
				if (cs === 'idle') window.dispatchEvent(new CustomEvent('leados:skip'));
				return;
			}
			// Outcome shortcuts (postmortem)
			if (cs === 'postmortem') {
				const outcomeMap: Record<string, string> = { '1':'answered', '2':'voicemail', '3':'no_answer', '4':'callback', '5':'not_interested', '6':'do_not_call' };
				const outcome = outcomeMap[e.key];
				if (outcome) window.dispatchEvent(new CustomEvent('leados:set-outcome', { detail: outcome }));
			}
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKey);
		return () => {
			window.removeEventListener('keydown', handleKey);
			if (gTimer) clearTimeout(gTimer);
		};
	});
</script>

{#if showHelp}
	<div class="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center" onclick={() => showHelp = false} role="dialog" aria-modal="true">
		<div class="bg-[#111111] border border-[#2a2a2a] rounded-xl w-[520px] max-h-[70vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
			<div class="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
				<p class="text-white font-medium text-sm">Keyboard Shortcuts</p>
				<button onclick={() => showHelp = false} class="text-[#666] hover:text-white"><Icon name="x" size={14} /></button>
			</div>
			<div class="p-5 space-y-4">
				{#each ['Global', 'Dialer', 'Dialer (postmortem)'] as ctx}
					<div>
						<p class="text-xs text-[#555] uppercase tracking-widest mb-2">{ctx}</p>
						<div class="space-y-1.5">
							{#each shortcuts.filter(s => s.context === ctx) as s}
								<div class="flex items-center justify-between">
									<p class="text-sm text-[#888]">{s.action}</p>
									<div class="flex gap-1">
										{#each s.keys as key}
											<kbd class="text-xs text-white bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-0.5">{key}</kbd>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
