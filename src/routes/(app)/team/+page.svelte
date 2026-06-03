<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { currentUser } from '$lib/stores';

	const me = $derived($currentUser);

	type Tab = 'members' | 'hr' | 'payroll';
	let activeTab = $state<Tab>('members');
	let loading = $state(true);

	// ── Members ───────────────────────────────────────────────
	interface Member {
		id: string; member_email: string; member_user_id: string | null; role: string; status: string;
		invited_at: string; accepted_at: string | null;
		first_name?: string; last_name?: string; title?: string; department?: string;
		hire_date?: string; contract_type?: string; pay_rate?: number; pay_type?: string;
		pay_frequency?: string; phone?: string; quota_monthly?: number; commission_rate?: number;
		notes?: string; client_id?: string | null; portal_access?: boolean;
		verbal_approved_at?: string | null;
	}

	async function approveVerbal(memberId: string) {
		const res = await apiFetch(`/api/team/${memberId}`, {
			method: 'PATCH',
			body: JSON.stringify({ verbal_approved_at: new Date().toISOString(), status: 'active' }),
		});
		if (res.ok) {
			members = members.map(m => m.id === memberId
				? { ...m, verbal_approved_at: new Date().toISOString(), status: 'active' }
				: m
			);
		}
	}
	let members = $state<Member[]>([]);
	let inviteEmail = $state('');
	let inviteRole = $state('agent');
	let inviting = $state(false);
	let inviteMsg = $state('');
	let inviteAsClient = $state(false);
	let inviteClientId = $state('');
	let clients = $state<{ id: string; name: string }[]>([]);

	// ── HR ────────────────────────────────────────────────────
	let editingMember = $state<string | null>(null);
	let hrForm = $state<Partial<Member>>({});
	let hrSaving = $state(false);

	// ── Payroll ───────────────────────────────────────────────
	let payrollEntries = $state<any[]>([]);
	let showPayrollForm = $state(false);
	let payrollForm = $state({
		teamMemberId: '', memberEmail: '', payPeriodStart: '', payPeriodEnd: '',
		basePay: '', commission: '', bonuses: '', deductions: '0',
		status: 'pending', paymentMethod: 'ach', notes: ''
	});
	let payrollSaving = $state(false);
	let payrollPeriodFilter = $state<'all' | 'pending' | 'paid'>('all');

	// ── Derived ───────────────────────────────────────────────
	const depts = $derived([...new Set(members.map(m => m.department).filter(Boolean))]);
	const filteredPayroll = $derived(
		payrollPeriodFilter === 'all' ? payrollEntries :
		payrollEntries.filter(p => p.status === payrollPeriodFilter)
	);
	const totalPendingPayroll = $derived(
		payrollEntries.filter(p => p.status === 'pending').reduce((s, p) => s + parseFloat(p.net_pay ?? 0), 0)
	);
	const totalPaidPayroll = $derived(
		payrollEntries.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_pay ?? 0), 0)
	);

	function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
	function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
	function roleColor(r: string) { return r === 'manager' ? 'text-blue-400' : r === 'sdr' ? 'text-green-400' : r === 'agent' ? 'text-[#888]' : 'text-purple-400'; }

	// ── Permissions ───────────────────────────────────────────────
	let permMemberId = $state<string | null>(null);
	let permValues = $state<Record<string, boolean>>({});
	let savingPerms = $state(false);

	const SDR_PERMS = [
		{ key: 'coaching',       label: 'Coaching page' },
		{ key: 'interview',      label: 'AI Interview' },
		{ key: 'profile',        label: 'Marketplace profile' },
		{ key: 'marketplace',    label: 'List on marketplace' },
		{ key: 'bonus_visible',  label: 'See bonus amounts' },
		{ key: 'performance',    label: 'Performance stats' },
		{ key: 'dossier',        label: 'Client brief / dossier' },
		{ key: 'messages',       label: 'Messaging' },
		{ key: 'callbacks',      label: 'Callbacks' },
	];

	const CLIENT_PERMS = [
		{ key: 'wins_tab',              label: 'Wins / appointment log' },
		{ key: 'approvals_tab',         label: 'Campaign approvals' },
		{ key: 'invoices_tab',          label: 'Invoice history' },
		{ key: 'messages_tab',          label: 'Messaging' },
		{ key: 'rep_names_visible',     label: 'See rep names' },
		{ key: 'call_details_visible',  label: 'See call details' },
	];

	function openPerms(member: Member) {
		permMemberId = member.id;
		const defaults = member.role === 'sdr'
			? Object.fromEntries(SDR_PERMS.map(p => [p.key, true]))
			: Object.fromEntries(CLIENT_PERMS.map(p => [p.key, true]));
		permValues = { ...defaults, ...((member as any).permissions ?? {}) };
	}

	async function savePerms() {
		if (!permMemberId) return;
		savingPerms = true;
		await apiFetch('/api/portal/permissions', {
			method: 'PATCH',
			body: JSON.stringify({ membershipId: permMemberId, permissions: permValues }),
		});
		await load();
		permMemberId = null;
		savingPerms = false;
	}

	// ── Load ──────────────────────────────────────────────────
	async function load() {
		const [tRes, pRes, cRes] = await Promise.all([
			apiFetch('/api/team'),
			apiFetch('/api/payroll'),
			apiFetch('/api/clients'),
		]);
		members = tRes.ok ? await tRes.json() : [];
		payrollEntries = pRes.ok ? await pRes.json() : [];
		clients = cRes.ok ? await cRes.json() : [];
	}

	onMount(load);

	// ── Member actions ────────────────────────────────────────
	async function invite() {
		if (!inviteEmail.trim()) return;
		if (inviteAsClient && !inviteClientId) { inviteMsg = 'Error: select a client to link this portal user to'; return; }
		inviting = true; inviteMsg = '';
		const res = await apiFetch('/api/team', {
			method: 'POST',
			body: JSON.stringify({
				email: inviteEmail,
				role: inviteAsClient ? 'client' : inviteRole,
				clientId: inviteAsClient ? inviteClientId : null,
				portalAccess: inviteAsClient,
			}),
		});
		if (res.ok) {
			const m = await res.json();
			members = [m, ...members];
			inviteEmail = '';
			inviteAsClient = false;
			inviteClientId = '';
			inviteMsg = m.status === 'active'
				? `✓ ${m.member_email} added as ${m.role}`
				: `Invite created for ${m.member_email}`;
		} else {
			const e = await res.json();
			inviteMsg = `Error: ${e.message}`;
		}
		inviting = false;
	}

	async function updateRole(id: string, role: string) {
		const res = await apiFetch(`/api/team/${id}`, { method: 'PUT', body: JSON.stringify({ role }) });
		if (res.ok) members = members.map(m => m.id === id ? { ...m, role } : m);
	}

	async function removeMe(id: string) {
		if (!confirm('Remove this team member?')) return;
		await apiFetch(`/api/team/${id}`, { method: 'DELETE' });
		members = members.filter(m => m.id !== id);
	}

	// ── HR actions ────────────────────────────────────────────
	function startEditHR(member: Member) {
		editingMember = member.id;
		hrForm = {
			first_name: member.first_name ?? '', last_name: member.last_name ?? '',
			title: member.title ?? '', department: member.department ?? '',
			hire_date: member.hire_date ?? '', contract_type: member.contract_type ?? 'full_time',
			pay_rate: member.pay_rate, pay_type: member.pay_type ?? 'salary',
			pay_frequency: member.pay_frequency ?? 'bi_weekly',
			phone: member.phone ?? '', quota_monthly: member.quota_monthly,
			commission_rate: member.commission_rate, notes: member.notes ?? '',
		};
	}

	async function saveHR() {
		hrSaving = true;
		const res = await apiFetch(`/api/team/${editingMember}`, {
			method: 'PUT',
			body: JSON.stringify({
				role: members.find(m => m.id === editingMember)?.role,
				firstName: hrForm.first_name, lastName: hrForm.last_name,
				title: hrForm.title, department: hrForm.department,
				hireDate: hrForm.hire_date || null, contractType: hrForm.contract_type,
				payRate: hrForm.pay_rate ? parseFloat(String(hrForm.pay_rate)) : null,
				payType: hrForm.pay_type, payFrequency: hrForm.pay_frequency,
				phone: hrForm.phone, quotaMonthly: hrForm.quota_monthly ? parseFloat(String(hrForm.quota_monthly)) : null,
				commissionRate: hrForm.commission_rate ? parseFloat(String(hrForm.commission_rate)) : null,
				notes: hrForm.notes,
			}),
		});
		if (res.ok) { await load(); editingMember = null; }
		hrSaving = false;
	}

	// ── Payroll actions ───────────────────────────────────────
	async function savePayroll() {
		payrollSaving = true;
		const selectedMember = members.find(m => m.id === payrollForm.teamMemberId);
		const res = await apiFetch('/api/payroll', {
			method: 'POST',
			body: JSON.stringify({
				...payrollForm,
				memberEmail: selectedMember?.member_email ?? payrollForm.memberEmail,
				basePay: parseFloat(payrollForm.basePay) || 0,
				commission: parseFloat(payrollForm.commission) || 0,
				bonuses: parseFloat(payrollForm.bonuses) || 0,
				deductions: parseFloat(payrollForm.deductions) || 0,
			}),
		});
		if (res.ok) {
			await load();
			payrollForm = { teamMemberId: '', memberEmail: '', payPeriodStart: '', payPeriodEnd: '', basePay: '', commission: '', bonuses: '', deductions: '0', status: 'pending', paymentMethod: 'ach', notes: '' };
			showPayrollForm = false;
		}
		payrollSaving = false;
	}

	async function markPayrollPaid(id: string) {
		await apiFetch(`/api/payroll/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
		await load();
	}

	async function deletePayroll(id: string) {
		if (!confirm('Delete payroll entry?')) return;
		await apiFetch(`/api/payroll/${id}`, { method: 'DELETE' });
		await load();
	}
</script>

<svelte:head><title>Team — LeadOS</title></svelte:head>

<div class="flex flex-col h-full bg-[#0a0a0a] text-[#f5f5f5] overflow-auto">

	<!-- Header -->
	<div class="px-6 py-4 border-b border-[#2a2a2a]">
		<h1 class="text-xl font-semibold">Team</h1>
		<p class="text-[#666] text-sm">Members, HR profiles, and payroll management</p>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 px-6 pt-4 border-b border-[#2a2a2a]">
		{#each [['members','Members'],['hr','HR Profiles'],['payroll','Payroll']] as [id, label]}
			<button onclick={() => activeTab = id as Tab} class="px-4 py-2 text-sm border-b-2 transition-colors {activeTab === id ? 'border-white text-white' : 'border-transparent text-[#666] hover:text-[#ccc]'}">{label}</button>
		{/each}
	</div>

	<div class="flex-1 overflow-auto p-6">

		<!-- ═══════════════ MEMBERS ═══════════════ -->
		{#if activeTab === 'members'}
			<!-- Owner card -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 flex items-center gap-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div class="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium">{me?.email?.[0]?.toUpperCase() ?? 'O'}</div>
				<div><div class="text-sm font-medium">{me?.email}</div><div class="text-xs text-purple-400">Owner</div></div>
			</div>

			<!-- Invite form -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div class="text-xs text-[#666] uppercase tracking-wide mb-3">Invite Team Member</div>
				<div class="flex gap-3">
					<input bind:value={inviteEmail} type="email" placeholder="colleague@company.com"
						onkeydown={(e) => e.key === 'Enter' && invite()}
						class="flex-1 border border-[#2a2a2a] bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					{#if !inviteAsClient}
						<select bind:value={inviteRole} class="border border-[#2a2a2a] bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							<option value="sdr">SDR — sees SDR view only</option>
							<option value="agent">Agent — sees full admin</option>
							<option value="manager">Manager — sees full admin</option>
						</select>
					{/if}
					<button onclick={invite} disabled={inviting || !inviteEmail.trim()} class="bg-white px-4 py-2 rounded-lg text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors whitespace-nowrap">
						{inviting ? 'Inviting…' : 'Invite'}
					</button>
				</div>

				<label class="flex items-center gap-2 text-xs text-[#777] mt-3 cursor-pointer select-none">
					<input type="checkbox" bind:checked={inviteAsClient} class="accent-blue-400" />
					<span>Client Portal Access <span class="text-[#555]">(read-only view of their project data)</span></span>
				</label>

				{#if inviteAsClient}
					<select bind:value={inviteClientId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white mt-2 focus:border-white focus:outline-none">
						<option value="">— Select client —</option>
						{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
					</select>
					<p class="text-xs text-blue-400 mt-1.5">This user will only see data for the selected client when they log in.</p>
				{/if}

				{#if inviteMsg}<p class="text-xs mt-2 {inviteMsg.startsWith('✓') ? 'text-green-400' : inviteMsg.startsWith('Error') ? 'text-red-400' : 'text-[#888]'}">{inviteMsg}</p>{/if}
			</div>

			<!-- Members list -->
			{#if members.length}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					{#each members as member}
						<div class="flex items-center gap-4 px-5 py-4 border-b border-[#1e1e1e] last:border-0 hover:bg-[#161616]">
							<div class="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-sm">{member.member_email[0].toUpperCase()}</div>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium truncate">
									{member.first_name && member.last_name ? `${member.first_name} ${member.last_name}` : member.member_email}
								</div>
								<div class="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
									{#if member.first_name}<span class="text-[#555]">{member.member_email}</span>{/if}
									<span class="{roleColor(member.role)} capitalize">{member.role}</span>
									{#if member.portal_access}<span class="text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded text-[10px]">Client Portal</span>{/if}
									{#if member.title}<span class="text-[#555]">· {member.title}</span>{/if}
									{#if member.department}<span class="text-[#555]">· {member.department}</span>{/if}
									{#if member.verbal_approved_at}
									<span class="text-green-400 text-[10px]">· ✓ Verbal approved</span>
								{:else if member.role === 'sdr'}
									<span class="text-yellow-500 text-[10px]">· Pending verbal call</span>
								{:else}
									<span class="{member.status === 'active' ? 'text-green-400' : 'text-yellow-400'} capitalize">· {member.status}</span>
								{/if}
								</div>
							</div>
							{#if member.pay_rate}
								<div class="text-xs text-[#666] text-right">
									<div>{fmt(member.pay_rate)}</div>
									<div class="text-[#444]">{member.pay_type}</div>
								</div>
							{/if}
							<div class="flex items-center gap-2">
								{#if member.role === 'sdr' && !member.verbal_approved_at}
									<button onclick={() => approveVerbal(member.id)}
										class="text-xs text-green-400 hover:text-green-300 border border-green-900/40 rounded px-2 py-0.5 hover:border-green-400 transition-colors font-medium"
										title="Mark verbal call complete — activates rep for dialing">
										✓ Approve
									</button>
								{/if}
								<button onclick={() => { activeTab = 'hr'; startEditHR(member); }} class="text-xs text-[#666] hover:text-white border border-[#333] rounded px-2 py-0.5 hover:border-white transition-colors">HR</button>
								<button onclick={() => openPerms(member)} class="text-xs text-purple-400 hover:text-purple-300 border border-purple-900/40 rounded px-2 py-0.5 hover:border-purple-400 transition-colors">Perms</button>
								<select value={member.role} onchange={(e) => updateRole(member.id, (e.target as HTMLSelectElement).value)}
									class="border border-[#2a2a2a] bg-[#1a1a1a] rounded px-2 py-1 text-xs text-white focus:border-white focus:outline-none">
									<option value="sdr">SDR</option>
									<option value="agent">Agent</option>
									<option value="manager">Manager</option>
								</select>
								<button onclick={() => removeMe(member.id)} class="text-xs text-red-700 hover:text-red-400 transition-colors">Remove</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-[#444] text-sm">No team members yet. Invite your first agent above.</p>
			{/if}

			<!-- Permissions panel -->
			{#if permMemberId}
				{@const member = members.find(m => m.id === permMemberId)}
				{@const isSDR = member?.role === 'sdr'}
				{@const permList = isSDR ? SDR_PERMS : CLIENT_PERMS}
				<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" role="dialog">
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-6 w-full max-w-sm space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-white font-semibold">Permissions</h3>
								<p class="text-xs text-[#555]">{member?.member_email} · <span class="capitalize">{member?.role}</span></p>
							</div>
							<button onclick={() => permMemberId = null} class="text-[#444] hover:text-white text-sm">✕</button>
						</div>
						<div class="space-y-2">
							{#each permList as perm}
								<label class="flex items-center justify-between cursor-pointer group">
									<span class="text-sm text-[#ccc] group-hover:text-white transition-colors">{perm.label}</span>
									<button onclick={() => permValues = { ...permValues, [perm.key]: !permValues[perm.key] }}
										class="relative w-10 h-5 rounded-full transition-colors {permValues[perm.key] !== false ? 'bg-green-600' : 'bg-[#2a2a2a]'}">
										<span class="absolute top-0.5 transition-all {permValues[perm.key] !== false ? 'left-5' : 'left-0.5'} w-4 h-4 rounded-full bg-white"></span>
									</button>
								</label>
							{/each}
						</div>
						<div class="flex gap-3 pt-2">
							<button onclick={() => permMemberId = null} class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#666] hover:text-white transition-colors">Cancel</button>
							<button onclick={savePerms} disabled={savingPerms} class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">
								{savingPerms ? 'Saving…' : 'Save'}
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Data sharing note -->
			<div class="mt-4 rounded-lg border border-[#1e1e1e] p-4">
				<p class="text-xs text-[#444] leading-relaxed">
					Team members share your <strong class="text-[#666]">clients, contacts, call lists, campaigns, and scripts</strong>.
					Managers can see all team call activity and analytics.
				</p>
			</div>

		<!-- ═══════════════ HR PROFILES ═══════════════ -->
		{:else if activeTab === 'hr'}
			<div class="text-sm text-[#666] mb-4">Click a member to edit their HR profile — employment details, pay rate, quotas, and emergency contacts.</div>

			{#if !editingMember}
				<div class="space-y-2">
					{#each members as member}
						<div class="bg-[#111] border border-[#2a2a2a] rounded-lg px-4 py-3 flex items-center gap-4 hover:bg-[#161616] cursor-pointer" onclick={() => startEditHR(member)}>
							<div class="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-sm">{member.member_email[0].toUpperCase()}</div>
							<div class="flex-1">
								<div class="text-sm font-medium">{member.first_name ? `${member.first_name} ${member.last_name}` : member.member_email}</div>
								<div class="text-xs text-[#555] flex gap-3 mt-0.5">
									{#if member.title}<span>{member.title}</span>{/if}
									{#if member.department}<span>{member.department}</span>{/if}
									{#if member.hire_date}<span>Hired {fmtDate(member.hire_date)}</span>{/if}
									{#if !member.hire_date && !member.title}<span class="text-[#444] italic">No HR info yet — click to add</span>{/if}
								</div>
							</div>
							{#if member.pay_rate}
								<div class="text-right text-xs">
									<div class="text-white">{fmt(member.pay_rate)}</div>
									<div class="text-[#555]">{member.pay_type} · {member.pay_frequency?.replace('_', ' ')}</div>
								</div>
							{/if}
							<span class="text-[#555] text-xs">Edit →</span>
						</div>
					{:else}
						<div class="text-center py-12 text-[#555] text-sm">No team members — invite someone from the Members tab first.</div>
					{/each}
				</div>

			{:else}
				<!-- HR Edit Form -->
				{@const member = members.find(m => m.id === editingMember)}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
					<div class="flex items-center justify-between mb-4">
						<div class="font-medium text-sm">HR Profile — {member?.member_email}</div>
						<button onclick={() => editingMember = null} class="text-xs text-[#666] hover:text-white transition-colors">← Back</button>
					</div>

					<div class="grid grid-cols-3 gap-3 mb-4">
						<div class="col-span-3 text-xs text-[#555] uppercase tracking-wide">Personal</div>
						<div><label class="block text-xs text-[#666] mb-1">First Name</label><input bind:value={hrForm.first_name} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white" /></div>
						<div><label class="block text-xs text-[#666] mb-1">Last Name</label><input bind:value={hrForm.last_name} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white" /></div>
						<div><label class="block text-xs text-[#666] mb-1">Phone</label><input bind:value={hrForm.phone} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white" /></div>

						<div class="col-span-3 text-xs text-[#555] uppercase tracking-wide mt-2">Employment</div>
						<div><label class="block text-xs text-[#666] mb-1">Title</label><input bind:value={hrForm.title} placeholder="Sales Agent" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
						<div><label class="block text-xs text-[#666] mb-1">Department</label><input bind:value={hrForm.department} placeholder="Sales" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
						<div><label class="block text-xs text-[#666] mb-1">Hire Date</label><DatePicker bind:value={hrForm.hire_date} onchange={(v) => hrForm.hire_date = v} /></div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Contract Type</label>
							<select bind:value={hrForm.contract_type} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="full_time">Full-time</option>
								<option value="part_time">Part-time</option>
								<option value="contractor">Contractor</option>
								<option value="intern">Intern</option>
								<option value="1099">1099</option>
							</select>
						</div>

						<div class="col-span-3 text-xs text-[#555] uppercase tracking-wide mt-2">Compensation</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Pay Type</label>
							<select bind:value={hrForm.pay_type} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="salary">Salary</option>
								<option value="hourly">Hourly</option>
								<option value="commission">Commission only</option>
								<option value="draw_plus_commission">Draw + Commission</option>
								<option value="contractor">Contractor rate</option>
							</select>
						</div>
						<div><label class="block text-xs text-[#666] mb-1">Pay Rate ($)</label><input type="number" bind:value={hrForm.pay_rate} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Pay Frequency</label>
							<select bind:value={hrForm.pay_frequency} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="weekly">Weekly</option>
								<option value="bi_weekly">Bi-weekly</option>
								<option value="semi_monthly">Semi-monthly</option>
								<option value="monthly">Monthly</option>
							</select>
						</div>
						<div><label class="block text-xs text-[#666] mb-1">Monthly Quota ($)</label><input type="number" bind:value={hrForm.quota_monthly} placeholder="0" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
						<div><label class="block text-xs text-[#666] mb-1">Commission Rate (%)</label><input type="number" bind:value={hrForm.commission_rate} placeholder="0" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>

						<div class="col-span-3">
							<label class="block text-xs text-[#666] mb-1">Notes</label>
							<textarea bind:value={hrForm.notes} rows="2" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white resize-none"></textarea>
						</div>
					</div>

					<div class="flex gap-2">
						<button onclick={saveHR} disabled={hrSaving} class="px-4 py-2 bg-white text-black rounded text-sm font-medium disabled:opacity-50">{hrSaving ? 'Saving…' : 'Save Profile'}</button>
						<button onclick={() => editingMember = null} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:text-white transition-colors">Cancel</button>
					</div>
				</div>
			{/if}

		<!-- ═══════════════ PAYROLL ═══════════════ -->
		{:else if activeTab === 'payroll'}
			<!-- Summary -->
			<div class="grid grid-cols-3 gap-4 mb-5">
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Pending Payroll</div>
					<div class="text-2xl font-semibold text-yellow-400">{fmt(totalPendingPayroll)}</div>
					<div class="text-xs text-[#555] mt-1">{payrollEntries.filter(p => p.status === 'pending').length} entries</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Paid (all time)</div>
					<div class="text-2xl font-semibold text-green-400">{fmt(totalPaidPayroll)}</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Team Size</div>
					<div class="text-2xl font-semibold">{members.length}</div>
					<div class="text-xs text-[#555] mt-1">{members.filter(m => m.pay_rate).length} with pay rate set</div>
				</div>
			</div>

			<div class="flex justify-between items-center mb-3">
				<div class="flex gap-2">
					{#each [['all','All'],['pending','Pending'],['paid','Paid']] as [v, l]}
						<button onclick={() => payrollPeriodFilter = v as any} class="px-3 py-1 text-xs rounded border transition-colors {payrollPeriodFilter === v ? 'border-white text-white' : 'border-[#333] text-[#666] hover:border-[#555]'}">{l}</button>
					{/each}
				</div>
				<button onclick={() => showPayrollForm = !showPayrollForm} class="px-3 py-1 text-xs border border-[#333] rounded hover:border-white hover:text-white text-[#999] transition-colors">+ New Entry</button>
			</div>

			{#if showPayrollForm}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
					<div class="text-sm font-medium mb-3">New Payroll