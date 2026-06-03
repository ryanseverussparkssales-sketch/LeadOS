<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { slide } from 'svelte/transition';
	import { signOut } from '$lib/services/auth';
	import { currentUser } from '$lib/stores';
	import { apiFetch } from '$lib/api';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';

	const user = $derived($currentUser);

	// DIALING — primary tools, ordered by priority
	const DIALING = [
		{ href: '/inbox',        label: 'Inbox',            icon: '📬' },
		{ href: '/dialer',       label: 'Power Dialer',     icon: '🎯' },
		{ href: '/phone',        label: 'Desk Phone',       icon: '📞' },
		{ href: '/dashboard',    label: 'Dashboard',        icon: '⬛' },
		{ href: '/calls',        label: 'Calls',            icon: '📋' },
	];

	// CONTACTS — both lead routes exist, keeping all three distinct pages
	const CONTACTS = [
		{ href: '/contacts',     label: 'Contacts',         icon: '👥' },
		{ href: '/companies',    label: 'Companies',        icon: '🏭' },
		{ href: '/leads',        label: 'Lead Gen',         icon: '🔍' },
		{ href: '/leads-inbox',  label: 'Lead Inbox',       icon: '📥' },
		{ href: '/import',       label: 'Import',           icon: '⬆️' },
	];

	// WORK
	const WORK = [
		{ href: '/campaigns',    label: 'Campaigns',        icon: '📣' },
		{ href: '/projects',     label: 'Projects',         icon: '📁' },
		{ href: '/tasks',        label: 'Tasks',            icon: '✅' },
		{ href: '/messaging',    label: 'Messaging',        icon: '💬' },
		{ href: '/scripts',      label: 'Scripts',          icon: '📝' },
		{ href: '/templates',    label: 'Templates',        icon: '📄' },
	];

	// CONTENT — collapsible
	const CONTENT = [
		{ href: '/marketing',    label: 'Marketing',        icon: '📢' },
		{ href: '/snippets',     label: 'Snippets',         icon: '⚡' },
		{ href: '/docs',         label: 'Docs',             icon: '📚' },
	];

	// ANALYTICS — top two always visible, rest collapsible
	const ANALYTICS_TOP = [
		{ href: '/analytics',    label: 'Analytics',        icon: '📊' },
		{ href: '/reports',      label: 'Reports',          icon: '📑' },
	];
	const ANALYTICS_MORE = [
		{ href: '/win-loss',     label: 'Win/Loss',         icon: '🏆' },
		{ href: '/leaderboard',  label: 'Leaderboard',      icon: '🥇' },
		{ href: '/time',         label: 'Time',             icon: '⏱' },
	];

	// AGENCY — Numbers moved to SYSTEM
	const AGENCY = [
		{ href: '/agency',         label: 'Command Center',   icon: '🎛' },
		{ href: '/agency/pool',    label: 'Lead Pool',        icon: '📋' },
		{ href: '/agency/calls',   label: 'Call Review',      icon: '🎙' },
		{ href: '/agency/payouts', label: 'Payouts',          icon: '💸' },
		{ href: '/clients',      label: 'Clients',          icon: '🏢' },
		{ href: '/team',         label: 'Team',             icon: '👤' },
		{ href: '/financials',   label: 'Financials',       icon: '💰' },
		{ href: '/pipeline',     label: 'Pipeline',         icon: '🔄' },
		{ href: '/my-leads',     label: 'My Leads',         icon: '⭐' },
	];

	// SYSTEM — Numbers moved here from AGENCY
	const SYSTEM = [
		{ href: '/settings',     label: 'Settings',         icon: '⚙️' },
		{ href: '/numbers',      label: 'Numbers',          icon: '📱' },
		{ href: '/trash',        label: 'Trash',            icon: '🗑️' },
	];

	// Mode switcher — persisted to localStorage
	type Mode = 'dial' | 'campaigns' | 'agency' | 'analyze';
	let mode = $state<Mode>('dial');

	const MODES: { id: Mode; icon: string; label: string }[] = [
		{ id: 'dial',      icon: '📞', label: 'Dial'      },
		{ id: 'campaigns', icon: '📣', label: 'Campaigns' },
		{ id: 'agency',    icon: '🏢', label: 'Agency'    },
		{ id: 'analyze',   icon: '📊', label: 'Analyze'   },
	];

	function setMode(m: Mode) {
		mode = m;
		if (browser) localStorage.setItem('leados_mode', m);
	}

	let collapsed = $state(false);
	let contentExpanded = $state(false);
	let analyticsExpanded = $state(false);
	let notifications = $state<any[]>([]);
	let agencyName = $state('My Agency');
	let smsUnread = $state(0);
	let emailUnread = $state(0);

	const currentPath = $derived($page.url.pathname);

	// True when the user is on a page inside the collapsible group — used to highlight
	// the group header even when the group is collapsed.
	const contentActive = $derived(
		['/marketing', '/snippets', '/docs'].some(p => currentPath.startsWith(p))
	);
	const analyticsActive = $derived(
		['/win-loss', '/leaderboard', '/time'].some(p => currentPath.startsWith(p))
	);

	function isActive(href: string) {
		return currentPath === href || currentPath.startsWith(href + '/');
	}

	async function handleSignOut() {
		// signOut() no longer throws, but wrap defensively anyway.
		try {
			await signOut();
		} catch {
			// Ignore — we're navigating away regardless.
		} finally {
			goto('/');
		}
	}

	async function loadUnreadCounts() {
		try {
			const r = await apiFetch('/api/sms/threads?limit=1');
			if (r.ok) { const d = await r.json(); smsUnread = d.totalUnread ?? 0; }
		} catch {}
		try {
			const r = await apiFetch('/api/emails/threads?limit=1');
			if (r.ok) { const d = await r.json(); emailUnread = d.totalUnread ?? 0; }
		} catch {}
	}

	onMount(async () => {
		if (!browser) return;
		// Restore saved mode
		const saved = localStorage.getItem('leados_mode') as Mode | null;
		if (saved && MODES.find(m => m.id === saved)) mode = saved;

		// Auto-switch mode based on current path
		const p = $page.url.pathname;
		if (['/agency','/clients','/team','/pipeline','/financials','/my-leads'].some(s => p.startsWith(s))) mode = 'agency';
		else if (['/campaigns','/projects','/scripts','/templates','/messaging','/sequences'].some(s => p.startsWith(s))) mode = 'campaigns';
		else if (['/analytics','/reports','/win-loss','/leaderboard','/time'].some(s => p.startsWith(s))) mode = 'analyze';
		else if (['/dialer','/phone','/calls','/contacts','/leads','/inbox','/import'].some(s => p.startsWith(s))) mode = 'dial';

		try {
			const res = await apiFetch('/api/notifications');
			if (res.ok) notifications = await res.json();
		} catch {}
		try {
			const res = await apiFetch('/api/settings');
			if (res.ok) {
				const s = await res.json();
				if (s.agency_name?.trim()) agencyName = s.agency_name.trim();
			}
		} catch {}
		loadUnreadCounts();
	});
</script>

<aside class="flex flex-col h-full bg-[var(--c-surface-0)] border-r border-[var(--c-border)] transition-all duration-200 {collapsed ? 'w-14' : 'w-56'}">

	<!-- Logo / collapse toggle -->
	<div class="flex items-center justify-between px-3 py-3 border-b border-[var(--c-border)]">
		{#if !collapsed}
			<span class="px-1" style="font-family:var(--font-label);font-size:16px;letter-spacing:.28em;font-weight:400;color:#fff">LEADOS</span>
		{/if}
		<button
			onclick={() => collapsed = !collapsed}
			class="ml-auto p-1.5 rounded hover:bg-[var(--c-surface-2)] text-[var(--c-text-faint)] hover:text-[var(--c-text-secondary)] transition-colors"
			title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{collapsed ? '→' : '←'}
		</button>
	</div>

	<!-- Agency name badge -->
	<div class="px-3 pb-2 pt-2">
		<div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-[var(--c-base)] border border-[var(--c-border)] text-[var(--c-text-ghost)]">
			<span class="text-sm">⚡</span>
			{#if !collapsed}
				<span class="truncate font-medium text-[var(--c-text-muted)]">{agencyName}</span>
			{/if}
		</div>
	</div>

	<!-- Mode switcher -->
	<div class="px-2 pb-2">
		{#if collapsed}
			<!-- Collapsed: stacked icons -->
			<div class="flex flex-col items-center gap-1">
				{#each MODES as m}
					<button onclick={() => setMode(m.id)}
						title={m.label}
						class="w-9 h-9 rounded-lg flex items-center justify-center text-base transition-colors {mode === m.id ? 'bg-white/15 text-white' : 'text-[#444] hover:text-[#888] hover:bg-white/5'}">
						{m.icon}
					</button>
				{/each}
			</div>
		{:else}
			<!-- Expanded: pill row -->
			<div class="grid grid-cols-4 gap-1 bg-[#0d0d0d] rounded-xl p-1 border border-[#1a1a1a]">
				{#each MODES as m}
					<button onclick={() => setMode(m.id)}
						title={m.label}
						class="flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-center transition-all {mode === m.id ? 'bg-[#1e1e1e] text-white shadow-sm' : 'text-[#444] hover:text-[#777]'}">
						<span class="text-sm leading-none">{m.icon}</span>
						<span style="font-family:var(--font-label);font-size:9px;letter-spacing:.18em;line-height:1">{m.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Global search -->
	{#if !collapsed}
		<div class="px-3 pb-2">
			<GlobalSearch />
		</div>
	{/if}

	<!-- Nav groups -->
	<nav class="flex-1 overflow-y-auto px-2 pb-2 space-y-3">

		<!-- DIAL MODE: Dialing + Contacts -->
		{#if mode === 'dial'}

		<!-- DIALING -->
		<div>
			{#if !collapsed}
				<div class="px-2 pb-1 font-label" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em;color:var(--c-text-faint)">DIALING</div>
			{/if}
			<div class="space-y-0.5">
				{#each DIALING as item, i}
					{#if i === 2 && !collapsed}
						<div class="mx-2 my-1 border-t border-[#1e1e1e]"></div>
					{/if}
					<!-- Special handling for /inbox to show combined unread badge -->
					{#if item.href === '/inbox'}
						<a
							href={item.href}
							class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors relative {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
							title={collapsed ? item.label : undefined}
						>
							<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
							{#if !collapsed}<span class="truncate">{item.label}</span>{/if}
							{#if (smsUnread + emailUnread) > 0}
								<span class="absolute top-1 left-6 bg-white text-black text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">
									{(smsUnread + emailUnread) > 9 ? '9+' : (smsUnread + emailUnread)}
								</span>
							{/if}
						</a>
					<!-- Special handling for /phone to show SMS unread badge -->
					{:else if item.href === '/phone'}
						<a
							href={item.href}
							class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors relative {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
							title={collapsed ? item.label : undefined}
						>
							<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
							{#if !collapsed}<span class="truncate">{item.label}</span>{/if}
							{#if smsUnread > 0}
								<span class="absolute top-1 left-6 bg-green-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">
									{smsUnread > 9 ? '9+' : smsUnread}
								</span>
							{/if}
						</a>
					{:else}
						<a
							href={item.href}
							class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
							title={collapsed ? item.label : undefined}
						>
							<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
							{#if !collapsed}
								<span class="truncate">{item.label}</span>
							{/if}
						</a>
					{/if}
				{/each}
			</div>
		</div>

		<!-- CONTACTS -->
		<div>
			{#if !collapsed}
				<div class="px-2 pb-1 font-label" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em;color:var(--c-text-faint)">CONTACTS</div>
			{/if}
			<div class="space-y-0.5">
				{#each CONTACTS as item}
					<a
						href={item.href}
						class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
						title={collapsed ? item.label : undefined}
					>
						<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
						{#if !collapsed}
							<span class="truncate">{item.label}</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>

		{/if} <!-- end dial mode -->

		<!-- CAMPAIGNS MODE: Work + Content -->
		{#if mode === 'campaigns'}

		<!-- WORK -->
		<div>
			{#if !collapsed}
				<div class="px-2 pb-1 font-label" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em;color:var(--c-text-faint)">WORK</div>
			{/if}
			<div class="space-y-0.5">
				{#each WORK as item}
					<a
						href={item.href}
						class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
						title={collapsed ? item.label : undefined}
					>
						<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
						{#if !collapsed}
							<span class="truncate">{item.label}</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>

		<!-- CONTENT — collapsible -->
		<div>
			{#if !collapsed}
				<button
					onclick={() => contentExpanded = !contentExpanded}
					class="w-full flex items-center justify-between px-2 pb-1 transition-colors {contentActive ? 'text-white' : 'text-[#444]'}" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em"
				>
					<span>CONTENT</span>
					<span class="text-[8px]">{contentExpanded ? '▲' : '▼'}</span>
				</button>
			{/if}
			{#if contentExpanded && !collapsed}
				<div transition:slide={{ duration: 150 }} class="space-y-0.5">
					{#each CONTENT as item}
						<a
							href={item.href}
							class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
							title={collapsed ? item.label : undefined}
						>
							<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
							{#if !collapsed}
								<span class="truncate">{item.label}</span>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		</div>

		{/if} <!-- end campaigns mode -->

		<!-- ANALYZE MODE: Analytics -->
		{#if mode === 'analyze'}

		<!-- ANALYTICS — top two always visible, rest collapsible -->
		<div>
			{#if !collapsed}
				<button
					onclick={() => analyticsExpanded = !analyticsExpanded}
					class="w-full flex items-center justify-between px-2 pb-1 transition-colors {analyticsActive ? 'text-white' : 'text-[#444]'}" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em"
				>
					<span>ANALYTICS</span>
					<span class="text-[8px]">{analyticsExpanded ? '▲' : '▼'}</span>
				</button>
			{/if}
			<div class="space-y-0.5">
				{#each ANALYTICS_TOP as item}
					<a
						href={item.href}
						class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
						title={collapsed ? item.label : undefined}
					>
						<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
						{#if !collapsed}
							<span class="truncate">{item.label}</span>
						{/if}
					</a>
				{/each}
				{#if analyticsExpanded && !collapsed}
					<div transition:slide={{ duration: 150 }}>
					{#each ANALYTICS_MORE as item}
						<a
							href={item.href}
							class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
							title={collapsed ? item.label : undefined}
						>
							<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
							{#if !collapsed}
								<span class="truncate">{item.label}</span>
							{/if}
						</a>
					{/each}
					</div>
				{/if}
			</div>
		</div>

		{/if} <!-- end analyze mode -->

		<!-- AGENCY MODE -->
		{#if mode === 'agency'}

		<!-- AGENCY -->
		<div>
			{#if !collapsed}
				<div class="px-2 pb-1 font-label" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em;color:var(--c-text-faint)">AGENCY</div>
			{/if}
			<div class="space-y-0.5">
				{#each AGENCY as item}
					<a
						href={item.href}
						class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
						title={collapsed ? item.label : undefined}
					>
						<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
						{#if !collapsed}
							<span class="truncate">{item.label}</span>
						{/if}
					</a>
				{/each}
				</div>
			</div>

		{/if} <!-- end agency mode -->

		<!-- SYSTEM — always visible regardless of mode -->
		<div>
			<div class="space-y-0.5">
				{#each SYSTEM as item}
					<a
						href={item.href}
						class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
						title={collapsed ? item.label : undefined}
					>
						<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
						{#if !collapsed}<span class="truncate">{item.label}</span>{/if}
					</a>
				{/each}
			</div>
		</div>

	</nav>

	<!-- Footer: AI Assistant, Help, user -->
	<div class="border-t border-[var(--c-border)] px-2 py-2 space-y-0.5">
		{#each [
			{ href: '/ai-assistant', label: 'AI Assistant', icon: '✦' },
			{ href: '/help', label: 'Help & Support', icon: '?' },
			{ href: '/notifications', label: 'Notifications', icon: '🔔' },
		] as item}
			<a href={item.href}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors {isActive(item.href) ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}"
				title={collapsed ? item.label : undefined}>
				<span class="text-base leading-none flex-shrink-0">{item.icon}</span>
				{#if !collapsed}<span class="truncate">{item.label}</span>{/if}
			</a>
		{/each}
		<div class="px-2
mt-2 border-t border-[#1a1a1a] pt-2">
	<a href="/settings" class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-[#888] hover:text-[#ccc] hover:bg-[#111]">
		<span>⚙️</span>
		{#if !collapsed}<span>Settings</span>{/if}
	</a>
</div>
</div>
</aside>
