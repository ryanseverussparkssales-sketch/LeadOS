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

	// ── Create account ──────────────────────────────────────────────────────────
	let showCreate = $state(false);
	let creating = $state(false);
	let form = $state<{ type: 'agency' | 'rep' | 'admin'; email: string; password: string; name: string; agencyName: string; ownerUserId: string; tier: string }>({
		type: 'agency', email: '', password: '', name: '', agencyName: '', ownerUserId: '', tier: 'agency',
	});

	async function createAccount() {
		if (!form.email || !form.password) { toastError('Email and password are required'); return; }
		if (form.password.length < 8) { toastError('Password must be at least 8 characters'); return; }
		if (form.type === 'rep' && !form.ownerUserId) { toastError('Pick the agency this rep belongs to'); return; }
		creating = true;
		const res = await apiFetch('/api/admin/accounts/create', {
			method: 'POST',
			body: JSON.stringify({
				type: form.type, email: form.email.trim(), password: form.password,
				name: form.name.trim() || undefined, agencyName: form.agencyName.trim() || undefined,
				ownerUserId: form.ownerUserId || undefined, tier: form.tier,
			}),
		});
		if (res.ok) {
			toastSuccess(`${form.type.charAt(0).toUpperCase() + form.type.slice(1)} account created`);
			showCreate = false;
			form = { type: 'agency', email: '', password: '', name: '', agencyName: '', ownerUserId: '', tier: 'agency' };
			const [aRes, mRes] = await Promise.all([apiFetch('/api/admin/accounts'), apiFetch('/api/admin/metrics')]);
			if (aRes.ok) accounts = (await aRes.json()).accounts ?? [];
			if (mRes.ok) metrics = await mRes.json();
		} else {
			const e = await res.json().catch(() => ({}));
			toastError(e.message ?? 'Could not create account');
		}
		creating = false;
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

<svelte:head><title>Platform Admin — Edelhaus</title></svelte:head>

<div class="h-full overflow-y-auto">
	{#if loading}
		<div class="flex justify-center py-24"><div class="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
	{:else if !allowed}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="text-[#333] mb-3"><Icon name="alert" size={36} /></div>
			<p class="text-white font-semibold">Restricted</p>
			<p class="text-[#7c7c7c] text-sm mt-1">This area is for platform super-admins only.</p>
		</div>
	{:else}
		<div class="max-w-6xl mx-auto px-6 py-8 space-y-8">
			<div>
				<h1 class="text-2xl font-bold text-white">Edelhaus Admin</h1>
				<p class="text-[#7c7c7c] text-sm mt-1">Master view across every agency account on the platform.</p>
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
							<div class="text-[10px] text-[#7c7c7c] uppercase tracking-widest mt-0.5">{label}</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Accounts -->
			<div class="space-y-3">
				<div class="flex items-center justify-between gap-3">
					<h2 class="text-sm font-semibold text-white uppercase tracking-widest">Agency Accounts ({filtered.length})</h2>
					<div class="flex items-center gap-2">
						<input bind:value={search} placeholder="Search email or agency…"
							class="w-56 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none" />
						<button onclick={() => showCreate = true}
							class="rounded-lg bg-[var(--call)] text-[var(--call-ink)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--call-hi)] transition-colors flex items-center gap-1.5 whitespace-nowrap">
							<Icon name="plus" size={14} /> New Account
						</button>
					</div>
				</div>

				<div class="rounded-xl border border-[#2a2a2a] overflow-hidden">
					<table class="w-full text-sm">
						<thead>
							<tr class="bg-[#0f0f0f] text-[#7c7c7c] text-[10px] uppercase tracking-widest">
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
										<div class="text-xs text-[#7c7c7c]">{acc.email}</div>
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
								<tr><td colspan="6" class="text-center text-[#7c7c7c] text-sm py-10">No accounts match</td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}

	<!-- Create account modal -->
	{#if showCreate}
		<div class="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="presentation" onclick={() => !creating && (showCreate = false)}>
			<div class="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 space-y-4" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				<div class="flex items-center justify-between">
					<h3 class="text-white font-semibold">New account</h3>
					<button onclick={() => showCreate = false} aria-label="Close" class="text-[#7c7c7c] hover:text-white"><Icon name="x" size={16} /></button>
				</div>

				<div class="grid grid-cols-3 gap-2">
					{#each [['agency','Agency'],['rep','Rep'],['admin','Admin']] as [val,label]}
						<button onclick={() => form.type = val as 'agency' | 'rep' | 'admin'}
							class="rounded-lg border px-3 py-2 text-xs font-medium transition-colors {form.type === val ? 'border-[var(--call)] bg-[var(--call)]/12 text-[var(--call)]' : 'border-[#2a2a2a] text-[#888] hover:text-white'}">{label}</button>
					{/each}
				</div>

				<input bind:value={form.email} type="email" placeholder="Email *"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none" />
				<input bind:value={form.password} type="text" placeholder="Temp password (min 8) *"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none" />
				<input bind:value={form.name} placeholder="Name (optional)"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none" />

				{#if form.type === 'agency' || form.type === 'admin'}
					<input bind:value={form.agencyName} placeholder="Agency name"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none" />
				{/if}
				{#if form.type === 'agency'}
					<select bind:value={form.tier} class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:outline-none">
						<option value="agency">agency plan</option>
						<option value="pro">pro plan</option>
						<option value="free">free plan</option>
					</select>
				{/if}
				{#if form.type === 'rep'}
					<select bind:value={form.ownerUserId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:outline-none">
						<option value="">Assign to agency… *</option>
						{#each owners as o}
							<option value={o.id}>{o.agency_name || o.email}</option>
						{/each}
					</select>
				{/if}

				<p class="text-[10px] text-[#7c7c7c] leading-relaxed">They sign in with this email + temp password. {form.type === 'admin' ? 'Admins get the Edelhaus Admin dashboard and unlimited access.' : form.type === 'rep' ? 'Reps appear under the chosen agency and can be assigned numbers.' : 'Creates a fresh agency workspace.'}</p>

				<button onclick={createAccount} disabled={creating}
					class="w-full rounded-lg bg-[var(--call)] text-[var(--call-ink)] py-2.5 text-sm font-semibold hover:bg-[var(--call-hi)] disabled:opacity-50 transition-colors">
					{creating ? 'Creating…' : 'Create account'}
				</button>
			</div>
		</div>
	{/if}
</div>
