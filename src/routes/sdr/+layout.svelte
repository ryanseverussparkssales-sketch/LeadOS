<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getSession } from '$lib/services/auth';
	import { apiFetch } from '$lib/api';
	import { toasts } from '$lib/stores/toast';
	import Toast from '$lib/components/Toast.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { children } = $props();

	let sdrName = $state('');
	let loading = $state(true);
	let permissions = $state<Record<string, boolean>>({});

	// Today's live stats — shown in the top strip
	let todayStats = $state({ calls: 0, answered: 0, wins: 0, bonusRate: 50 });

	async function loadTodayStats() {
		try {
			const today = new Date().toISOString().split('T')[0];
			const [callsRes, engRes] = await Promise.all([
				apiFetch(`/api/calls?date=${today}&limit=200`),
				apiFetch('/api/engagements'),
			]);
			if (callsRes.ok) {
				const data = await callsRes.json();
				const calls = data.calls ?? data ?? [];
				const WIN = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up']);
				todayStats = {
					calls: calls.length,
					answered: calls.filter((c: any) => c.outcome && c.outcome !== 'no_answer' && c.outcome !== 'voicemail').length,
					wins: calls.filter((c: any) => WIN.has(c.outcome ?? '')).length,
					bonusRate: todayStats.bonusRate,
				};
			}
			if (engRes.ok) {
				const engs = await engRes.json();
				if (engs.length > 0) todayStats = { ...todayStats, bonusRate: engs[0].bonus_rate ?? 50 };
			}
		} catch { /* non-fatal */ }
	}

	// All possible nav items — filtered by permissions below
	const ALL_NAV = [
		{ href: '/sdr',                    label: 'Queue',           icon: 'phone',     key: null },
		{ href: '/sdr/dashboard',          label: 'Dashboard',       icon: 'dashboard', key: null },
		{ href: '/sdr/getting-started',    label: 'Getting Started', icon: 'rocket',    key: null },
		{ href: '/sdr/messages',           label: 'Messages',        icon: 'message',   key: 'messages' },
		{ href: '/sdr/dossier',     label: 'Client Brief', icon: 'report',    key: 'dossier' },
		{ href: '/sdr/scripts',     label: 'Scripts',      icon: 'fileText',  key: 'scripts' },
		{ href: '/sdr/coaching',    label: 'Coaching',     icon: 'target',    key: 'coaching' },
		{ href: '/sdr/performance', label: 'Performance',  icon: 'chart',     key: 'performance' },
		{ href: '/sdr/callbacks',   label: 'Callbacks',    icon: 'calendar',  key: 'callbacks' },
		{ href: '/sdr/profile',     label: 'My Profile',   icon: 'user',      key: 'profile' },
		{ href: '/sdr/portfolio',   label: 'Portfolio',    icon: 'film',      key: 'portfolio' },
		{ href: '/sdr/interview',   label: 'AI Interview', icon: 'mic',       key: 'interview' },
	];

	// Only show items where permission is null (always-on) or explicitly true
	const NAV = $derived(ALL_NAV.filter(item =>
		item.key === null || permissions[item.key] !== false
	));

	const currentPath = $derived($page.url.pathname);

	// Prefix-match so deep routes (e.g. /sdr/messages/123) keep their nav highlight;
	// /sdr (Queue) stays exact so it isn't always active.
	function isActive(href: string) {
		return href === '/sdr' ? currentPath === '/sdr' : (currentPath === href || currentPath.startsWith(href + '/'));
	}

	let sidebarOpen = $state(false);
	// Close the mobile drawer whenever the route changes.
	$effect(() => { void currentPath; sidebarOpen = false; });

	onMount(async () => {
		const session = await getSession();
		if (!session) { goto('/'); return; }
		sdrName = session.user.email?.split('@')[0] ?? 'SDR';

		// Load permissions
		const permRes = await apiFetch('/api/portal/permissions');
		if (permRes.ok) {
			const d = await permRes.json();
			permissions = d.permissions ?? {};
		}

		loading = false;
		loadTodayStats();

		// Refresh stats every 60s
		const interval = setInterval(loadTodayStats, 60_000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head><title>Edelhaus — SDR</title></svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-screen bg-[#0a0a0a]">
		<div class="w-4 h-4 rounded-full bg-white animate-pulse"></div>
	</div>
{:else}
{#snippet sidebarInner()}
	<div class="px-4 py-5 border-b border-[#1e1e1e]">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:13px;letter-spacing:.28em;color:#fff">EDELHAUS</p>
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:8px;letter-spacing:.18em;color:#2a2a2a;margin-top:2px">SDR PORTAL</p>
	</div>

	<nav class="rogue-nav flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
		{#each NAV as item}
			<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}
				class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors {isActive(item.href) ? 'text-white' : 'text-[#666] hover:text-white hover:bg-white/5'}">
				<Icon name={item.icon} size={17} class="flex-shrink-0" />
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="px-4 py-4 border-t border-[#1e1e1e]">
		<p class="text-xs text-[#555] truncate">{sdrName}</p>
		<a href="/" class="text-[10px] text-[#333] hover:text-white transition-colors">← Exit</a>
	</div>
{/snippet}

<div class="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
	<!-- Desktop sidebar -->
	<div class="hidden md:flex w-52 shrink-0 flex-col border-r border-[#1e1e1e] bg-[#050505]">
		{@render sidebarInner()}
	</div>

	<!-- Mobile drawer -->
	{#if sidebarOpen}
		<button class="fixed inset-0 z-40 bg-black/60 md:hidden" aria-label="Close menu" onclick={() => sidebarOpen = false}></button>
		<div class="fixed inset-y-0 left-0 z-50 w-52 flex flex-col border-r border-[#1e1e1e] bg-[#050505] md:hidden">
			{@render sidebarInner()}
		</div>
	{/if}

	<!-- Main content -->
	<div class="flex-1 overflow-hidden flex flex-col">
		<!-- Mobile top bar -->
		<div class="md:hidden flex items-center gap-3 px-4 py-2.5 border-b border-[#111] bg-[#050505] shrink-0">
			<button onclick={() => sidebarOpen = true} aria-label="Open menu"
				class="p-1 rounded text-[#888] hover:text-white transition-colors">☰</button>
			<span class="text-xs font-bold tracking-widest text-[#f5f5f5]">EDELHAUS · SDR</span>
		</div>

		<!-- Today's stats strip -->
		<div class="shrink-0 border-b border-[#111] bg-[#040404] px-5 flex items-center gap-6 h-9 overflow-x-auto">
			{#each [
				{ label: 'Dials', value: todayStats.calls, color: '#fff' },
				{ label: 'Connect', value: todayStats.answered > 0 ? `${Math.round((todayStats.answered / todayStats.calls) * 100)}%` : '—', color: '#3b82f6' },
				{ label: 'Appts', value: todayStats.wins, color: '#22c55e' },
				{ label: 'Earned', value: `$${(todayStats.wins * todayStats.bonusRate).toLocaleString()}`, color: '#ca8a04' },
			] as stat}
				<div class="flex items-center gap-1.5">
					<span style="font-size:12px;font-weight:600;color:{stat.color};font-variant-numeric:tabular-nums;letter-spacing:-.01em">{stat.value}</span>
					<span style="font-family:var(--font-label,'Cormorant SC',serif);font-size:8px;letter-spacing:.14em;color:#2a2a2a">{stat.label.toUpperCase()}</span>
				</div>
			{/each}
			<div class="ml-auto">
				<span style="font-family:var(--font-label,'Cormorant SC',serif);font-size:8px;letter-spacing:.14em;color:#1a1a1a">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</span>
			</div>
		</div>
		{@render children()}
	</div>
</div>
{/if}

<Toast />
