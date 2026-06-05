<script lang="ts">
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import SnippetExpander from '$lib/components/SnippetExpander.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import ErrorRecoveryBar from '$lib/components/ErrorRecoveryBar.svelte';
	import HelpPanel from '$lib/components/HelpPanel.svelte';
	import IncomingCallBanner from '$lib/components/IncomingCallBanner.svelte';
	import FloatingCallBar from '$lib/components/FloatingCallBar.svelte';
	import ImpersonationBanner from '$lib/components/ImpersonationBanner.svelte';
	import { superAdmin } from '$lib/stores/admin';
	import { stopImpersonation } from '$lib/stores/impersonation';
	import { onMount, onDestroy } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { navigating, page } from '$app/stores';

	// Page transition — cross-fade between routes
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
	import { getSession } from '$lib/services/auth';
	import { currentUser } from '$lib/stores';
	import { initTwilioDevice, destroyDevice } from '$lib/stores/twilio';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import GlobalAIAssistant from '$lib/components/GlobalAIAssistant.svelte';
	import SessionBar from '$lib/components/SessionBar.svelte';
	import OnboardingChecklist from '$lib/components/OnboardingChecklist.svelte';

	let { children } = $props();

	let sidebarOpen = $state(false);
	// Gate the shell until session + role checks resolve, so client-portal/SDR users
	// don't flash the admin UI before being redirected to their own view.
	let checking = $state(true);

	const isPortal = $derived($page.url.pathname === '/client-portal');

	// Close mobile sidebar on route change
	$effect(() => {
		if ($navigating) sidebarOpen = false;
	});

	onMount(async () => {
		// Wrap the entire auth check in try/catch so that any transient network
		// error or Supabase hiccup does NOT crash the mount and log the user out.
		try {
			const session = await getSession();
			if (!session) {
				// Genuinely no session (never logged in or refresh token revoked).
				goto('/');
				return;
			}
			currentUser.set(session.user);

			// Init Twilio device globally — non-fatal if it fails.
			// Fires once per app session; the store guard prevents double-init.
			initTwilioDevice().catch((err) => {
				console.warn('[layout] Twilio device init failed (non-fatal):', err);
			});

			// Check if this user is a client portal member (not a full agency user).
			// A failed portal check is non-fatal — don't let it block the app.
			try {
				const { apiFetch } = await import('$lib/api');

				// 1. Client portal check
				const portalCheck = await apiFetch('/api/portal/client');
				if (portalCheck.ok) {
					if (!window.location.pathname.startsWith('/client-portal')) {
						goto('/client-portal');
						return;
					}
				}

				// 2. SDR check — team members who are not client portal users go to SDR view
				const sdrCheck = await apiFetch('/api/portal/sdr');
				if (sdrCheck.ok) {
					const { isSdr } = await sdrCheck.json();
					if (isSdr && !window.location.pathname.startsWith('/sdr')) {
						goto('/sdr');
						return;
					}
				}
				// 3. Super-admin status → enables the /admin area + "view as" banner.
				try {
					const statusRes = await apiFetch('/api/admin/status');
					if (statusRes.ok) {
						const st = await statusRes.json();
						superAdmin.set(!!st.superAdmin);
						// Clear any stale impersonation flag if this user isn't actually an admin.
						if (!st.superAdmin) stopImpersonation();
					}
				} catch { /* non-fatal */ }
			} catch (portalErr) {
				console.warn('[layout] Role check failed, continuing as admin:', portalErr);
			}
		} catch (err) {
			// getSession itself threw — extremely rare (e.g. localStorage unavailable).
			// Log for debugging but do not redirect; let the user stay on the page.
			console.error('[layout] Auth check threw unexpectedly:', err);
		}

		// Reached here without redirecting → this user belongs on the admin shell.
		checking = false;

		// Global keyboard shortcut: ? opens help panel
		const keyHandler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
			if (e.key === '?') {
				window.dispatchEvent(new CustomEvent('leados:help'));
			}
		};
		window.addEventListener('keydown', keyHandler);
		return () => window.removeEventListener('keydown', keyHandler);
	});

	onDestroy(() => {
		destroyDevice();
	});
</script>

<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:z-[1000] focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-1.5 focus:rounded focus:text-sm">Skip to content</a>

<OfflineBanner />
<ErrorRecoveryBar />
<Toast />
<KeyboardShortcuts />
<SnippetExpander />
<HelpPanel />
<IncomingCallBanner />
<FloatingCallBar />
<ImpersonationBanner />

{#if checking}
	<div class="flex h-screen items-center justify-center bg-[var(--c-surface-0)]">
		<div class="w-6 h-6 rounded-full border-2 border-[#333] border-t-white animate-spin"></div>
	</div>
{:else}
<div class="flex h-screen bg-[var(--c-surface-0)] text-[#f5f5f5] overflow-hidden">

	{#if !isPortal}
		<!-- Desktop sidebar -->
		<div class="hidden md:flex flex-col flex-shrink-0">
			<Sidebar />
		</div>

		<!-- Mobile sidebar overlay -->
		{#if sidebarOpen}
			<div
				class="fixed inset-0 z-40 md:hidden"
				role="button"
				tabindex="-1"
				onclick={() => sidebarOpen = false}
				onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
			>
				<div class="absolute inset-0 bg-black/60"></div>
			</div>
			<div class="fixed inset-y-0 left-0 z-50 md:hidden flex flex-col">
				<Sidebar />
			</div>
		{/if}
	{/if}

	<!-- Main content -->
	<main id="main-content" class="flex-1 overflow-auto scroll-smooth {isPortal ? '' : 'pb-10'}">
		{#if !isPortal}
			<!-- Mobile top bar -->
			<div class="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[#1e1e1e] bg-[#0a0a0a]">
				<button
					onclick={() => sidebarOpen = !sidebarOpen}
					class="p-1.5 rounded hover:bg-[#1a1a1a] text-[#888] hover:text-white transition-colors"
					aria-label="Toggle sidebar"
				>
					☰
				</button>
				<span class="text-sm font-bold tracking-widest text-[#f5f5f5]">ROGUEOS</span>
			</div>

			<OnboardingChecklist />
			<SessionBar />
		{/if}

		{@render children()}
	</main>

	{#if !isPortal}
		<GlobalAIAssistant />
	{/if}
</div>
{/if}
