<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface ChecklistItem {
		id: string;
		label: string;
		done: boolean;
		href: string;
	}

	let items = $state<ChecklistItem[]>([
		{ id: 'twilio', label: 'Connect a Twilio number', done: false, href: '/numbers' },
		{ id: 'gmail', label: 'Connect a Gmail account', done: false, href: '/settings#email-accounts' },
		{ id: 'contacts', label: 'Import your first contacts', done: false, href: '/contacts' },
		{ id: 'campaign', label: 'Create your first campaign', done: false, href: '/campaigns' },
		{ id: 'call', label: 'Make your first call', done: false, href: '/dialer' },
	]);
	let expanded = $state(true);
	let dismissed = $state(false);
	let loading = $state(true);

	const completedCount = $derived(items.filter(i => i.done).length);
	const allDone = $derived(completedCount === items.length);

	onMount(async () => {
		if (typeof localStorage !== 'undefined') {
			dismissed = localStorage.getItem('onboarding_dismissed') === 'true';
			if (dismissed) { loading = false; return; }
		}
		await checkProgress();
	});

	async function checkProgress() {
		loading = true;
		try {
			const [numbersRes, accountsRes, contactsRes, campaignsRes, callsRes] = await Promise.all([
				apiFetch('/api/numbers?limit=1'),
				apiFetch('/api/email-accounts?limit=1'),
				apiFetch('/api/contacts/filtered?limit=1'),
				apiFetch('/api/campaigns?limit=1'),
				apiFetch('/api/calls?limit=1'),
			]);

			const responses = [numbersRes, accountsRes, contactsRes, campaignsRes, callsRes];

			for (let i = 0; i < items.length; i++) {
				const res = responses[i];
				if (res.ok) {
					try {
						const d = await res.clone().json();
						const count = Array.isArray(d) ? d.length : (d.data?.length ?? d.count ?? 0);
						items[i] = { ...items[i], done: count > 0 };
					} catch {
						items[i] = { ...items[i], done: false };
					}
				} else {
					items[i] = { ...items[i], done: false };
				}
			}
		} catch {}
		loading = false;
	}

	function dismiss() {
		dismissed = true;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('onboarding_dismissed', 'true');
		}
	}
</script>

{#if !dismissed && !loading && !allDone}
	<div class="border-b border-[var(--c-border)] bg-[var(--c-surface-1)]">
		<div class="px-6 py-3 flex items-center justify-between">
			<button onclick={() => expanded = !expanded}
				class="flex items-center gap-3 flex-1 text-left">
				<div class="flex items-center gap-2">
					<div class="w-24 h-1.5 bg-[var(--c-surface-2)] rounded-full overflow-hidden">
						<div class="h-full bg-[var(--accent)] transition-all rounded-full"
							style="width: {Math.round(completedCount / items.length * 100)}%"></div>
					</div>
					<span class="text-xs text-[#555]">{completedCount}/{items.length} complete</span>
				</div>
				<span class="text-xs text-white font-medium">Get Edelhaus set up</span>
				<span class="text-[10px] text-[#444]">{expanded ? '▲' : '▼'}</span>
			</button>
			<button onclick={dismiss} class="text-[#333] hover:text-white text-xs ml-4">Dismiss</button>
		</div>
		{#if expanded}
			<div class="px-6 pb-4 flex flex-wrap gap-3">
				{#each items as item}
					<a href={item.href}
						class="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors {item.done ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--c-border-subtle)] text-[#666] hover:border-white hover:text-white'}">
						<span>{item.done ? '✓' : '○'}</span>
						<span>{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
