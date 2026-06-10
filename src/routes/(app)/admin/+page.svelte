<script lang="ts">
	import { onMount } from 'svelte';
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
	interface Override {
		suspended: boolean; suspended_reason: string | null; ai_access: 'on' | 'off' | null;
		trial_ends_at: string | null; rate_limit_multiplier: number | null; notes: string | null;
	}
	interface Detail {
		id: string; email: string | null; created_at: string; last_sign_in_at: string | null; tier: string; agency_name: string | null;
		team: { id: string; member_email: string; role: string; status: string }[];
		numbers: { id: string; phone_number: string; status: string }[];
		override: Override | null;
		usage: { contacts: number; calls: number; calls30d: number; spend: { total: number; claude: number; twilio: number; groq: number } };
		recentCalls: { id: string; created_at: string; outcome: string | null; summary: string | null }[];
	}

	let allowed = $state<boolean | null>(null);
	let tab = $state<'accounts' | 'health' | 'audit'>('accounts');
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
		const [mRes, aRes] = await Promise.all([apiFetch('/api/admin/metrics'), apiFetch('/api/admin/accounts')]);
		if (mRes.ok) metrics = await mRes.json();
		if (aRes.ok) accounts = (await aRes.json()).accounts ?? [];
		loading = false;
	});

	async function reloadAccounts() {
		const [aRes, mRes] = await Promise.all([apiFetch('/api/admin/accounts'), apiFetch('/api/admin/metrics')]);
		if (aRes.ok) accounts = (await aRes.json()).accounts ?? [];
		if (mRes.ok) metrics = await mRes.json();
	}

	async function setTier(acc: Account, tier: string) {
		savingTier = acc.id;
		const res = await apiFetch(`/api/admin/accounts/${acc.id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier }) });
		if (res.ok) { accounts = accounts.map(a => a.id === acc.id ? { ...a, tier } : a); toastSuccess(`${acc.agency_name ?? acc.email} → ${tier}`); }
		else toastError('Could not update tier');
		savingTier = null;
	}

	async function viewAs(acc: { id: string; agency_name: string | null; email: string | null }) {
		await apiFetch(`/api/admin/accounts/${acc.id}/impersonate`, { method: 'POST' }).catch(() => {});
		startImpersonation(acc.id, acc.agency_name || acc.email || acc.id);
		window.location.href = '/dashboard';
	}

	// ── Account detail drawer ─────────────────────────────────────────────────
	let detail = $state<Detail | null>(null);
	let detailLoading = $state(false);
	let busy = $state(false);

	async function openDetail(id: string) {
		detail = null; detailLoading = true;
		const res = await apiFetch(`/api/admin/accounts/${id}`);
		detail = res.ok ? await res.json() : null;
		if (!res.ok) toastError('Could not load account');
		detailLoading = false;
	}
	function closeDetail() { detail = null; }

	async function doSuspend(suspended: boolean) {
		if (!detail) return;
		let reason: string | null = null;
		if (suspended) reason = prompt('Reason for suspension (optional):') ?? null;
		busy = true;
		const res = await apiFetch(`/api/admin/accounts/${detail.id}/suspend`, { method: 'POST', body: JSON.stringify({ suspended, reason }) });
		busy = false;
		if (res.ok) { toastSuccess(suspended ? 'Account suspended' : 'Account reactivated'); await openDetail(detail.id); }
		else toastError('Action failed');
	}

	async function resetPassword() {
		if (!detail) return;
		const pw = prompt('New temporary password (min 8 chars):');
		if (!pw) return;
		if (pw.length < 8) { toastError('Password must be at least 8 characters'); return; }
		busy = true;
		const res = await apiFetch(`/api/admin/accounts/${detail.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
		busy = false;
		if (res.ok) toastSuccess('Password reset'); else toastError('Reset failed');
	}

	async function forceLogout() {
		if (!detail) return;
		busy = true;
		const res = await apiFetch(`/api/admin/accounts/${detail.id}/logout`, { method: 'POST' });
		busy = false;
		toastSuccess(res.ok ? 'Sessions revoked' : 'Could not revoke');
	}

	async function offboard() {
		if (!detail) return;
		if (!confirm(`Offboard ${detail.agency_name ?? detail.email}? This permanently suspends the account and revokes access. It's reversible via Reactivate and their data is preserved.`)) return;
		if (prompt('Type OFFBOARD to confirm') !== 'OFFBOARD') return;
		busy = true;
		const res = await apiFetch(`/api/admin/accounts/${detail.id}`, { method: 'DELETE' });
		busy = false;
		if (res.ok) { toastSuccess('Account offboarded'); closeDetail(); await reloadAccounts(); }
		else toastError('Offboard failed');
	}

	async function saveOverride(patch: Record<string, unknown>) {
		if (!detail) return;
		busy = true;
		const res = await apiFetch(`/api/admin/accounts/${detail.id}/overrides`, { method: 'PATCH', body: JSON.stringify(patch) });
		busy = false;
		if (res.ok) { toastSuccess('Override saved'); await openDetail(detail.id); }
		else toastError('Could not save override');
	}

	// ── Health tab ────────────────────────────────────────────────────────────
	let health = $state<any>(null);
	let healthLoading = $state(false);
	async function loadHealth() {
		healthLoading = true;
		const res = await apiFetch('/api/admin/health');
		health = res.ok ? await res.json() : null;
		healthLoading = false;
	}

	// ── Audit tab ─────────────────────────────────────────────────────────────
	let audit = $state<any[]>([]);
	let auditLoading = $state(false);
	async function loadAudit() {
		auditLoading = true;
		const res = await apiFetch('/api/admin/audit?limit=150');
		audit = res.ok ? (await res.json()).entries ?? [] : [];
		auditLoading = false;
	}

	$effect(() => {
		if (tab === 'health' && !health && !healthLoading) loadHealth();
		if (tab === 'audit' && audit.length === 0 && !auditLoading) loadAudit();
	});

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
			await reloadAccounts();
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
	function fmtDateTime(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
	function money(n: number) { return `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`; }
	const ACTION_LABEL: Record<string, string> = {
		tier_change: 'Tier change', suspend: 'Suspended', reactivate: 'Reactivated', reset_password: 'Password reset',
		force_logout: 'Force logout', impersonate: 'Viewed as', override_update: 'Override', offboard: 'Offboarded', create_account: 'Created account',
	};
</script>

<svelte:head><title>Platform Admin — Edelhaus</title></svelte:head>

<div class="h-full overflow-y-auto">
	{#if loading}
		<div class="flex justify-center py-24"><div class="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
	{:else if !allowed}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="text-[#444] mb-3"><Icon name="alert" size={36} /></div>
			<p class="text-white font-semibold">Restricted</p>
			<p class="text-[#9a9a9a] text-sm mt-1">This area is for platform super-admins only.</p>
		</div>
	{:else}
		<div class="max-w-6xl mx-auto px-6 py-8 space-y-6">
			<div class="flex items-end justify-between">
				<div>
					<h1 class="text-2xl font-bold text-white">Edelhaus Admin</h1>
					<p class="text-[#9a9a9a] text-sm mt-1">Master control across every account on the platform.</p>
				</div>
				<div class="flex gap-1">
					{#each (['accounts','health','audit'] as const) as t}
						<button onclick={() => tab = t}
							class="rounded-lg px-3 py-1.5 text-xs capitalize transition-colors {tab === t ? 'bg-white/10 text-white' : 'text-[#888] hover:text-white'}">{t}</button>
					{/each}
				</div>
			</div>

			{#if tab === 'accounts'}
				{#if metrics}
					<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
						{#each [
							['Accounts', metrics.accounts], ['Paid', metrics.paidAccounts], ['Active reps', metrics.activeReps],
							['Contacts', metrics.totalContacts], ['Calls (all)', metrics.totalCalls], ['Calls (30d)', metrics.callsLast30d],
							['Pro', metrics.byTier.pro ?? 0], ['Agency', metrics.byTier.agency ?? 0],
						] as [label, value]}
							<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3">
								<div class="text-2xl font-bold text-white tabular-nums">{value}</div>
								<div class="text-[10px] text-[#9a9a9a] uppercase tracking-widest mt-0.5">{label}</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-sm font-semibold text-white uppercase tracking-widest">Accounts ({filtered.length})</h2>
						<div class="flex items-center gap-2">
							<input bind:value={search} placeholder="Search email or agency…"
								class="w-56 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5 text-sm text-white placeholder-[#666] focus:border-[#444] focus:outline-none" />
							<button onclick={() => showCreate = true}
								class="rounded-lg bg-[var(--call)] text-[var(--call-ink)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--call-hi)] transition-colors flex items-center gap-1.5 whitespace-nowrap">
								<Icon name="plus" size={14} /> New Account
							</button>
						</div>
					</div>

					<div class="rounded-xl border border-[#2a2a2a] overflow-hidden">
						<table class="w-full text-sm">
							<thead>
								<tr class="bg-[#0f0f0f] text-[#9a9a9a] text-[10px] uppercase tracking-widest">
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
											<div class="text-xs text-[#9a9a9a]">{acc.email}</div>
										</td>
										<td class="px-4 py-3">
											<select value={acc.tier} onchange={(e) => setTier(acc, (e.target as HTMLSelectElement).value)} disabled={savingTier === acc.id}
												class="rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white focus:outline-none">
												<option value="free">free</option><option value="pro">pro</option><option value="agency">agency</option>
											</select>
										</td>
										<td class="px-4 py-3 text-[#9a9a9a] tabular-nums">{acc.team_size}</td>
										<td class="px-4 py-3 text-[#9a9a9a]">{fmtDate(acc.created_at)}</td>
										<td class="px-4 py-3 text-[#9a9a9a]">{fmtDate(acc.last_sign_in_at)}</td>
										<td class="px-4 py-3 text-right whitespace-nowrap">
											<button onclick={() => openDetail(acc.id)} class="text-xs text-white hover:underline font-medium mr-3">Manage</button>
											<button onclick={() => viewAs(acc)} class="text-xs text-[var(--accent)] hover:underline font-medium">View as →</button>
										</td>
									</tr>
								{/each}
								{#if filtered.length === 0}
									<tr><td colspan="6" class="text-center text-[#9a9a9a] text-sm py-10">No accounts match</td></tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			{#if tab === 'health'}
				{#if healthLoading}
					<div class="flex justify-center py-16"><div class="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
				{:else if health}
					<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
						{#each [['Calls 24h', health.calls24h], ['Voicemails 24h', health.voicemails24h], ['Spend 24h', money(health.spend24h)], ['Suspended', health.suspended.length]] as [l,v]}
							<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3">
								<div class="text-2xl font-bold text-white tabular-nums">{v}</div>
								<div class="text-[10px] text-[#9a9a9a] uppercase tracking-widest mt-0.5">{l}</div>
							</div>
						{/each}
					</div>
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5">
						<p class="text-xs text-[#bbb] uppercase tracking-widest mb-3">Cron Jobs</p>
						<div class="space-y-2">
							{#each health.cron as c}
								<div class="flex items-center justify-between text-sm">
									<div class="flex items-center gap-2">
										<span class="w-2 h-2 rounded-full {c.stale ? 'bg-[var(--end)]' : 'bg-[var(--call)]'}"></span>
										<span class="text-white font-mono text-xs">{c.job_name}</span>
									</div>
									<div class="flex items-center gap-3">
										<span class="text-xs {c.stale ? 'text-[var(--end-text)]' : 'text-[#9a9a9a]'}">{c.stale ? 'STALE' : 'ok'}</span>
										<span class="text-xs text-[#888]">{fmtDateTime(c.last_run)}</span>
									</div>
								</div>
							{:else}
								<p class="text-sm text-[#888]">No cron runs recorded yet.</p>
							{/each}
						</div>
					</div>
					{#if health.suspended.length}
						<div class="rounded-xl border border-[var(--end)]/30 bg-[#111] p-5">
							<p class="text-xs text-[var(--end-text)] uppercase tracking-widest mb-3">Suspended accounts</p>
							{#each health.suspended as s}
								<div class="flex items-center justify-between text-sm py-1">
									<button class="text-white hover:underline font-mono text-xs" onclick={() => { tab='accounts'; openDetail(s.user_id); }}>{s.user_id.slice(0,8)}…</button>
									<span class="text-xs text-[#9a9a9a]">{s.suspended_reason ?? '—'} · {fmtDateTime(s.suspended_at)}</span>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			{/if}

			{#if tab === 'audit'}
				{#if auditLoading}
					<div class="flex justify-center py-16"><div class="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
				{:else}
					<div class="rounded-xl border border-[#2a2a2a] overflow-hidden">
						<table class="w-full text-sm">
							<thead><tr class="bg-[#0f0f0f] text-[#9a9a9a] text-[10px] uppercase tracking-widest">
								<th class="text-left font-medium px-4 py-2.5">When</th>
								<th class="text-left font-medium px-4 py-2.5">Action</th>
								<th class="text-left font-medium px-4 py-2.5">Admin</th>
								<th class="text-left font-medium px-4 py-2.5">Target</th>
								<th class="text-left font-medium px-4 py-2.5">Detail</th>
							</tr></thead>
							<tbody>
								{#each audit as e (e.id)}
									<tr class="border-t border-[#1a1a1a]">
										<td class="px-4 py-2.5 text-[#9a9a9a] whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
										<td class="px-4 py-2.5 text-white">{ACTION_LABEL[e.action] ?? e.action}</td>
										<td class="px-4 py-2.5 text-[#9a9a9a] text-xs">{e.admin_email ?? e.admin_user_id?.slice(0,8)}</td>
										<td class="px-4 py-2.5 text-[#9a9a9a] text-xs">{e.target_email ?? (e.target_user_id ? e.target_user_id.slice(0,8)+'…' : '—')}</td>
										<td class="px-4 py-2.5 text-[#888] text-xs font-mono truncate max-w-[220px]">{e.detail && Object.keys(e.detail).length ? JSON.stringify(e.detail) : '—'}</td>
									</tr>
								{:else}
									<tr><td colspan="5" class="text-center text-[#9a9a9a] text-sm py-10">No admin actions logged yet.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Account detail drawer -->
	{#if detail || detailLoading}
		<div class="fixed inset-0 z-[110] flex justify-end bg-black/60" role="presentation" onclick={closeDetail}>
			<div class="w-full max-w-lg h-full overflow-y-auto bg-[#0d0d0d] border-l border-[#2a2a2a] p-6 space-y-5" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				{#if detailLoading}
					<div class="flex justify-center py-24"><div class="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
				{:else if detail}
					<div class="flex items-start justify-between">
						<div>
							<h3 class="text-white font-semibold text-lg">{detail.agency_name ?? detail.email}</h3>
							<p class="text-xs text-[#9a9a9a]">{detail.email}</p>
							<div class="flex items-center gap-2 mt-2">
								<span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-white">{detail.tier}</span>
								{#if detail.override?.suspended}<span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[var(--end)]/15 text-[var(--end-text)]">Suspended</span>{/if}
								{#if detail.override?.ai_access}<span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">AI {detail.override.ai_access}</span>{/if}
							</div>
						</div>
						<button onclick={closeDetail} aria-label="Close" class="text-[#9a9a9a] hover:text-white"><Icon name="x" size={18} /></button>
					</div>

					<div class="grid grid-cols-3 gap-2">
						{#each [['Contacts', detail.usage.contacts], ['Calls', detail.usage.calls], ['Calls 30d', detail.usage.calls30d]] as [l,v]}
							<div class="rounded-lg border border-[#222] bg-[#111] px-3 py-2"><div class="text-lg font-bold text-white tabular-nums">{v}</div><div class="text-[9px] text-[#9a9a9a] uppercase tracking-widest">{l}</div></div>
						{/each}
					</div>
					<div class="rounded-lg border border-[#222] bg-[#111] px-3 py-2.5">
						<div class="text-[10px] text-[#bbb] uppercase tracking-widest mb-1.5">Spend (logged)</div>
						<div class="flex justify-between text-xs"><span class="text-[#9a9a9a]">Total</span><span class="text-white font-mono">{money(detail.usage.spend.total)}</span></div>
						<div class="flex justify-between text-xs"><span class="text-[#9a9a9a]">Claude</span><span class="text-[#9a9a9a] font-mono">{money(detail.usage.spend.claude)}</span></div>
						<div class="flex justify-between text-xs"><span class="text-[#9a9a9a]">Twilio</span><span class="text-[#9a9a9a] font-mono">{money(detail.usage.spend.twilio)}</span></div>
					</div>

					<div class="rounded-lg border border-[#222] bg-[#111] p-4 space-y-3">
						<p class="text-[10px] text-[#bbb] uppercase tracking-widest">Overrides</p>
						<div class="flex items-center justify-between">
							<span class="text-sm text-white">AI access</span>
							<select value={detail.override?.ai_access ?? ''} disabled={busy}
								onchange={(e) => saveOverride({ ai_access: (e.target as HTMLSelectElement).value || null })}
								class="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1 text-xs text-white focus:outline-none">
								<option value="">default (by plan)</option><option value="on">force on</option><option value="off">force off</option>
							</select>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-white">Rate-limit ×</span>
							<input type="number" min="0.1" step="0.1" value={detail.override?.rate_limit_multiplier ?? 1} disabled={busy}
								onchange={(e) => saveOverride({ rate_limit_multiplier: Number((e.target as HTMLInputElement).value) })}
								class="w-20 rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1 text-xs text-white text-right focus:outline-none" />
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-white">Trial ends</span>
							<input type="date" value={detail.override?.trial_ends_at?.slice(0,10) ?? ''} disabled={busy}
								onchange={(e) => saveOverride({ trial_ends_at: (e.target as HTMLInputElement).value || null })}
								class="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1 text-xs text-white focus:outline-none" />
						</div>
					</div>

					{#if detail.team.length}
						<div class="rounded-lg border border-[#222] bg-[#111] p-4">
							<p class="text-[10px] text-[#bbb] uppercase tracking-widest mb-2">Team ({detail.team.length})</p>
							{#each detail.team as m}<div class="flex justify-between text-xs py-0.5"><span class="text-white">{m.member_email}</span><span class="text-[#9a9a9a]">{m.role} · {m.status}</span></div>{/each}
						</div>
					{/if}
					{#if detail.numbers.length}
						<div class="rounded-lg border border-[#222] bg-[#111] p-4">
							<p class="text-[10px] text-[#bbb] uppercase tracking-widest mb-2">Numbers ({detail.numbers.length})</p>
							{#each detail.numbers as n}<div class="flex justify-between text-xs py-0.5"><span class="text-white font-mono">{n.phone_number}</span><span class="text-[#9a9a9a]">{n.status}</span></div>{/each}
						</div>
					{/if}

					<div class="space-y-2 pt-1">
						<p class="text-[10px] text-[#bbb] uppercase tracking-widest">Actions</p>
						<div class="grid grid-cols-2 gap-2">
							{#if detail.override?.suspended}
								<button onclick={() => doSuspend(false)} disabled={busy} class="rounded-lg border border-[var(--call)]/40 text-[var(--call)] py-2 text-xs font-medium hover:bg-[var(--call)]/10 disabled:opacity-50">Reactivate</button>
							{:else}
								<button onclick={() => doSuspend(true)} disabled={busy} class="rounded-lg border border-yellow-700/50 text-yellow-500 py-2 text-xs font-medium hover:bg-yellow-900/20 disabled:opacity-50">Suspend</button>
							{/if}
							<button onclick={resetPassword} disabled={busy} class="rounded-lg border border-[#2a2a2a] text-white py-2 text-xs font-medium hover:bg-white/5 disabled:opacity-50">Reset password</button>
							<button onclick={forceLogout} disabled={busy} class="rounded-lg border border-[#2a2a2a] text-white py-2 text-xs font-medium hover:bg-white/5 disabled:opacity-50">Force logout</button>
							<button onclick={() => detail && viewAs(detail)} disabled={busy} class="rounded-lg border border-[var(--accent)]/40 text-[var(--accent)] py-2 text-xs font-medium hover:bg-[var(--accent)]/10 disabled:opacity-50">View as →</button>
						</div>
						<button onclick={offboard} disabled={busy} class="w-full rounded-lg border border-[var(--end)]/40 text-[var(--end-text)] py-2 text-xs font-medium hover:bg-[var(--end)]/10 disabled:opacity-50 mt-1">Offboard (suspend & lock)</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Create account modal -->
	{#if showCreate}
		<div class="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="presentation" onclick={() => !creating && (showCreate = false)}>
			<div class="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 space-y-4" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				<div class="flex items-center justify-between">
					<h3 class="text-white font-semibold">New account</h3>
					<button onclick={() => showCreate = false} aria-label="Close" class="text-[#9a9a9a] hover:text-white"><Icon name="x" size={16} /></button>
				</div>
				<div class="grid grid-cols-3 gap-2">
					{#each [['agency','Agency'],['rep','Rep'],['admin','Admin']] as [val,label]}
						<button onclick={() => form.type = val as 'agency' | 'rep' | 'admin'}
							class="rounded-lg border px-3 py-2 text-xs font-medium transition-colors {form.type === val ? 'border-[var(--call)] bg-[var(--call)]/12 text-[var(--call)]' : 'border-[#2a2a2a] text-[#9a9a9a] hover:text-white'}">{label}</button>
					{/each}
				</div>
				<input bind:value={form.email} type="email" placeholder="Email *" class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#666] focus:border-[#444] focus:outline-none" />
				<input bind:value={form.password} type="text" placeholder="Temp password (min 8) *" class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#666] focus:border-[#444] focus:outline-none" />
				<input bind:value={form.name} placeholder="Name (optional)" class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#666] focus:border-[#444] focus:outline-none" />
				{#if form.type === 'agency' || form.type === 'admin'}
					<input bind:value={form.agencyName} placeholder="Agency name" class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#666] focus:border-[#444] focus:outline-none" />
				{/if}
				{#if form.type === 'agency'}
					<select bind:value={form.tier} class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:outline-none">
						<option value="agency">agency plan</option><option value="pro">pro plan</option><option value="free">free plan</option>
					</select>
				{/if}
				{#if form.type === 'rep'}
					<select bind:value={form.ownerUserId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:outline-none">
						<option value="">Assign to agency… *</option>
						{#each owners as o}<option value={o.id}>{o.agency_name || o.email}</option>{/each}
					</select>
				{/if}
				<p class="text-[10px] text-[#9a9a9a] leading-relaxed">They sign in with this email + temp password. {form.type === 'admin' ? 'Admins get the Edelhaus Admin dashboard and unlimited access.' : form.type === 'rep' ? 'Reps appear under the chosen agency.' : 'Creates a fresh agency workspace.'}</p>
				<button onclick={createAccount} disabled={creating} class="w-full rounded-lg bg-[var(--call)] text-[var(--call-ink)] py-2.5 text-sm font-semibold hover:bg-[var(--call-hi)] disabled:opacity-50 transition-colors">{creating ? 'Creating…' : 'Create account'}</button>
			</div>
		</div>
	{/if}
</div>
