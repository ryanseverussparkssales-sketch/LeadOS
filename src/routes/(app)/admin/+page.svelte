<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import { startImpersonation } from '$lib/stores/impersonation';
	import Icon from '$lib/components/Icon.svelte';

	interface Account {
		id: string; email: string | null; created_at: string; last_sign_in_at: string | null;
		agency_name: string | null; tier: string; is_team_member: boolean; owner_user_id: string | null; team_size: number;
	}
	interface Metrics {
		accounts: number; activeReps: number; totalContacts: number; totalCalls: number;
		callsLast30d: number; byTier: Record<string, number>; paidAccounts: number;
	}

	let allowed = $state<boolean | null>(null);
	let metrics = $state<Metrics | null>(null);
	let accounts = $state<Account[]>([]);
	let loading = $state(true);
	let search = $state('');
	let savingTier = $state<string | null>(null);

	const owners = $derived(accounts.filter(a => !a.is_team_member));
	const filtered = $derived(
		search.trim()
			? owners.filter(a =>
				(a.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
				(a.agency_name ?? '').toLowerCase().includes(search.toLowerCase()))
			: owners
	);

	onMount(async () => {
		const s = await apiFetch('/api/admin/status');
		const status = s.ok ? await s.json() : { superAdmin: false };
		allowed = !!status.superAdmin;
		if (!allowed) { loading = false; return; }

		const [mRes, aRes] = await Promise.all([
			apiFetch('/api/admin/metrics'),
			apiFetch('/api/admin/accounts'),
		]);
		if (mRes.ok) metrics = await mRes.json();
		if (aRes.ok) accounts = (await aRes.json()).accounts ?? [];
		loading = false;
	});

	async function setTier(acc: Account, tier: string) {
		savingTier = acc.id;
		const res = await apiFetch(`/api/admin/accounts/${acc.id}/tier`, {
			method: 'PATCH', body: JSON.stringify({ tier }),
		});
		if (res.ok) {
			accounts = accounts.map(a => a.id === acc.id ? { ...a, tier } : a);
			toastSuccess(`${acc.agency_name ?? acc.email} → ${tier}`);
		} else {
			toastError('Could not update tier');
		}
		savingTier = null;
	}

	function viewAs(acc: Account) {
		startImpersonation(acc.id, acc.agency_name || acc.email || acc.id);
		// Full reload so all views refetch scoped to the impersonated account.
		window.location.href = '/dashboard';
	}

	function fmtDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
	const TIER_COLORS: Record<string, string> = {
		free: 'text-[#888] bg-[#1a1a1a]',
		pro: 'text-[var(--accent)] bg-[var(--accent)]/12',
		agency: 'text-[var(--call)] bg-[var(--call)]/12',
	};
</script>

<svelte:head><title>Platform Admin — RogueOS</title></svelte:head>

<div class="h-full overflow-y-auto">
	{#if loading}
		<div class="flex justify-center py-24"><div class="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
	{:else if !allowed}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="text-[#333] mb-3"><Icon name="alert" size={36} /></div>
			<p class="text-white font-semibold">Restricted</p>
			<p class="text-[#555] text-sm mt-1">This area is for platform super-admins only.</p>
		</div>
	{:else}
		<div class="max-w-6xl mx-auto px-6 py-8 space-y-8">
			<div>
				<h1 class="text-2xl font-bold text-white">RogueOS Admin</h1>
				<p class="text-[#555] text-sm mt-1">Master view across every agency account on the platform.</p>
			</div>

			<!-- Metrics -->
			{#if metrics}
				<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
					{#each [
						['Accounts', metrics.accounts],
						['Paid accounts', metrics.paidAccounts],
						['Active reps', metrics.activeReps],
						['Contacts', metrics.totalContacts],
						['Calls (all-time)', metrics.totalCalls],
						['Calls (30d)', metrics.callsLast30d],
						['Pro', metrics.byTier.pro ?? 0],
						['Agency', metrics.byTier.agency ?? 0],
					] as [label, value]}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3">
							<div class="text-2xl font-bold text-white tabular-nums">{value}</div>
							<div class="text-[10px] text-[#555] uppercase tracking-widest mt-0.5">{label}</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Accounts -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold text-white uppercase tracking-widest">Agency Accounts ({filtered.length})</h2>
					<input bind:value={search} placeholder="Search email or agency…"
						class="w-64 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none" />
				</div>

				<div class="rounded-xl border border-[#2a2a2a] overflow-hidden">
					<table class="w-full text-sm">
						<thead>
							<tr class="bg-[#0f0f0f] text-[#555] text-[10px] uppercase tracking-widest">
								<th class="text-left font-medium px-4 py-2.5">Account</th>
								<th class="text-left font-medium px-4 py-2.5">Plan</th>
								<th class="text-left font-medium px-4 py-2.5">Team</th>
								<th class="text-left font-medium px-4 py-2.5">Joined</th>
								<th class="text-left font-medium px-4 py-2.5">Last login</th>
								<th class="text-right font-medium px-4 py-2.5"></th>
							</tr>
						</thead>
						<tbody>
							{#each filtered as acc (acc.id)}
								<tr class="border-t border-[#1a1a1a] hover:bg-[#0f0f0f] transition-colors">
									<td class="px-4 py-3">
										<div class="text-white font-medium">{acc.agency_name ?? '—'}</div>
										<div class="text-xs text-[#555]">{acc.email}</div>
									</td>
									<td class="px-4 py-3">
										<select value={acc.tier} onchange={(e) => setTier(acc, (e.target as HTMLSelectElement).value)}
											disabled={savingTier === acc.id}
											class="rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white focus:outline-none {TIER_COLORS[acc.tier] ?? ''}">
											<option value="free">free</option>
											<option value="pro">pro</option>
											<option value="agency">agency</option>
										</select>
									</td>
									<td class="px-4 py-3 text-[#888] tabular-nums">{acc.team_size}</td>
									<td class="px-4 py-3 text-[#888]">{fmtDate(acc.created_at)}</td>
									<td class="px-4 py-3 text-[#888]">{fmtDate(acc.last_sign_in_at)}</td>
									<td class="px-4 py-3 text-right">
										<button onclick={() => viewAs(acc)}
											class="text-xs text-[var(--accent)] hover:underline font-medium">View as →</button>
									</td>
								</tr>
							{/each}
							{#if filtered.length === 0}
								<tr><td colspan="6" class="text-center text-[#555] text-sm py-10">No accounts match</td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>
