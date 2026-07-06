<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Win {
		id: string; created_at: string; outcome: string;
		summary: string | null; call_duration_seconds: number | null;
		contact: { name: string; company: string | null } | null;
		user_id: string; sdr_email?: string;
		payout?: { id: string; status: string; amount_cents: number } | null;
	}
	interface Member { id: string; member_email: string; stripe_connect_status: string; stripe_connect_account_id: string | null; }
	interface Payout {
		id: string; amount_cents: number; status: string; paid_at: string | null; created_at: string; notes: string | null;
		team_member: { member_email: string } | null;
		call: { id: string; outcome: string; contact: { name: string; company: string | null } | null } | null;
	}

	let wins = $state<Win[]>([]);
	let members = $state<Member[]>([]);
	let payouts = $state<Payout[]>([]);
	let loading = $state(true);

	// Pay modal
	let payingWin = $state<Win | null>(null);
	let selectedMemberId = $state('');
	let payAmount = $state('');
	let payNotes = $state('');
	let processing = $state(false);

	// Tab
	let activeTab = $state<'unpaid' | 'history'>('unpaid');

	onMount(async () => {
		const [winsRes, membersRes, payoutsRes] = await Promise.all([
			apiFetch('/api/calls?limit=200'),
			apiFetch('/api/team'),
			apiFetch('/api/payouts'),
		]);
		if (winsRes.ok) {
			const all = await winsRes.json();
			wins = all.filter((c: Win) =>
				['appointment_set','demo_scheduled','meeting_confirmed','signed_up'].includes(c.outcome ?? '')
			);
		}
		if (membersRes.ok) {
			const d = await membersRes.json();
			members = (d.members ?? d ?? []).filter((m: Member) => m.stripe_connect_status !== undefined);
		}
		if (payoutsRes.ok) payouts = await payoutsRes.json();
		loading = false;
	});

	function paidCallIds() { return new Set(payouts.filter(p => p.status === 'paid').map(p => p.call?.id)); }

	const unpaidWins = $derived(wins.filter(w => !paidCallIds().has(w.id)));
	const totalPaid = $derived(payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount_cents, 0));
	const totalPending = $derived(unpaidWins.length);

	function openPayModal(win: Win) {
		payingWin = win;
		// Auto-select if only one SDR
		const sdrMembers = members.filter(m => m.stripe_connect_status === 'active');
		if (sdrMembers.length === 1) selectedMemberId = sdrMembers[0].id;
		payAmount = '50'; // default bonus
		payNotes = '';
	}

	async function approvePay() {
		if (!payingWin || !selectedMemberId || !payAmount) return;
		processing = true;
		const res = await apiFetch('/api/payouts', {
			method: 'POST',
			body: JSON.stringify({
				call_id: payingWin.id,
				team_member_id: selectedMemberId,
				amount_cents: Math.round(parseFloat(payAmount) * 100),
				notes: payNotes || undefined,
			}),
		});
		if (res.ok) {
			const payout = await res.json();
			payouts = [payout, ...payouts];
			toastSuccess(`Payout of $${payAmount} sent`);
			payingWin = null;
		} else {
			const err = await res.json().catch(() => ({}));
			toastError((err as any).message ?? 'Payout failed');
		}
		processing = false;
	}

	function fmtCents(c: number) { return `$${(c / 100).toFixed(2)}`; }
	const OUTCOME_ICON: Record<string, string> = {
		appointment_set: '📅', demo_scheduled: '🖥', meeting_confirmed: '✓', signed_up: '🎉',
	};
</script>

<svelte:head><title>{titleFor('Payouts')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Rep Payouts</h2>
			<p class="text-[10px] text-[#6e6e6e] mt-0.5">Approve wins → transfer to rep's Stripe account</p>
		</div>
		<div class="flex items-center gap-4 text-xs">
			<div class="text-center">
				<p class="text-white font-semibold">{totalPending}</p>
				<p class="text-[#6e6e6e]">pending</p>
			</div>
			<div class="text-center">
				<p class="text-[var(--accent)] font-semibold">{fmtCents(totalPaid)}</p>
				<p class="text-[#6e6e6e]">paid out</p>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex border-b border-[#1a1a1a] shrink-0">
		{#each [['unpaid','Pending Wins'],['history','Payout History']] as [tab, label]}
			<button onclick={() => activeTab = tab as any}
				class="px-6 py-3 text-xs font-medium border-b-2 transition-colors {activeTab === tab ? 'border-white text-white' : 'border-transparent text-[#7c7c7c] hover:text-white'}">
				{label}
				{#if tab === 'unpaid' && totalPending > 0}
					<span class="ml-1.5 bg-yellow-600 text-white text-[9px] px-1.5 py-0.5 rounded-full">{totalPending}</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="flex-1 p-6 max-w-4xl mx-auto w-full">
		{#if loading}
			<div class="space-y-2">{#each [1,2,3] as _}<div class="h-16 bg-[#111] rounded-xl animate-pulse"></div>{/each}</div>

		{:else if activeTab === 'unpaid'}
			{#if unpaidWins.length === 0}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-8 text-center mt-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<p class="text-2xl mb-2">✓</p>
					<p class="text-sm text-white font-medium">All wins paid out</p>
					<p class="text-xs text-[#6e6e6e] mt-1">New wins will appear here when logged</p>
				</div>
			{:else}
				<div class="space-y-2 mt-2">
					{#each unpaidWins as win}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<span class="text-lg shrink-0">{OUTCOME_ICON[win.outcome] ?? '✓'}</span>
							<div class="flex-1 min-w-0">
								<p class="text-sm text-white font-medium">{win.contact?.name ?? 'Unknown'}</p>
								<p class="text-xs text-[#7c7c7c]">{win.contact?.company ?? ''} · {new Date(win.created_at).toLocaleDateString()}</p>
							</div>
							<button onclick={() => openPayModal(win)}
								class="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hi)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition-colors shrink-0">
								💸 Pay Rep
							</button>
						</div>
					{/each}
				</div>
			{/if}

		{:else}
			{#if payouts.length === 0}
				<div class="rounded-xl border border-[#1a1a1a] bg-[#111] p-8 text-center mt-4">
					<p class="text-xs text-[#6e6e6e]">No payouts yet</p>
				</div>
			{:else}
				<div class="space-y-2 mt-2">
					{#each payouts as p}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<p class="text-sm text-white font-medium">{p.team_member?.member_email?.split('@')[0] ?? '—'}</p>
									<span class="text-[9px] px-1.5 py-0.5 rounded {p.status === 'paid' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : p.status === 'failed' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'}">
										{p.status}
									</span>
								</div>
								<p class="text-xs text-[#7c7c7c]">{p.call?.contact?.name ?? '—'} · {new Date(p.created_at).toLocaleDateString()}</p>
							</div>
							<p class="text-sm font-semibold text-[var(--accent)] shrink-0">{fmtCents(p.amount_cents)}</p>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Pay modal -->
{#if payingWin}
	<div class="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"
		role="dialog"
		onclick={(e) => { if ((e.target as Element).classList.contains('z-[100]')) payingWin = null; }}>
		<div class="rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] w-full max-w-sm p-6 space-y-4 shadow-2xl">
			<h3 class="text-white font-semibold">Approve Payout</h3>
			<div class="rounded-xl border border-[#1a1a1a] bg-[#111] px-3 py-2">
				<p class="text-xs text-white">{payingWin.contact?.name ?? 'Unknown'}</p>
				<p class="text-[10px] text-[#7c7c7c]">{payingWin.outcome} · {new Date(payingWin.created_at).toLocaleDateString()}</p>
			</div>

			<!-- Rep selector -->
			<div>
				<label class="block text-xs text-[#7c7c7c] mb-1.5">Rep to pay</label>
				<select bind:value={selectedMemberId}
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
					<option value="">Select rep…</option>
					{#each members as m}
						<option value={m.id} disabled={m.stripe_connect_status !== 'active'}>
							{m.member_email} {m.stripe_connect_status !== 'active' ? '(not connected)' : ''}
						</option>
					{/each}
				</select>
				{#if members.filter(m => m.stripe_connect_status === 'active').length === 0}
					<p class="text-[9px] text-yellow-500 mt-1">No reps have connected Stripe yet. They need to connect from their Performance page.</p>
				{/if}
			</div>

			<!-- Amount -->
			<div>
				<label class="block text-xs text-[#7c7c7c] mb-1.5">Amount ($)</label>
				<input bind:value={payAmount} type="number" min="0.50" step="0.50" placeholder="50.00"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none" />
			</div>

			<div>
				<label class="block text-xs text-[#7c7c7c] mb-1.5">Notes (optional)</label>
				<input bind:value={payNotes} placeholder="Bonus for Thursday campaign…"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
			</div>

			<div class="flex gap-3 pt-1">
				<button onclick={() => payingWin = null}
					class="flex-1 rounded-lg border border-[#2a2a2a] py-2.5 text-xs text-[#8a8a8a] hover:text-white hover:border-white transition-colors">
					Cancel
				</button>
				<button onclick={approvePay} disabled={processing || !selectedMemberId || !payAmount}
					class="flex-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hi)] py-2.5 text-xs font-semibold text-[var(--accent-ink)] disabled:opacity-40 transition-colors">
					{processing ? 'Sending…' : `💸 Send $${payAmount || '0'}`}
				</button>
			</div>
		</div>
	</div>
{/if}
