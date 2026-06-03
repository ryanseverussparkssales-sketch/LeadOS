<script lang="ts">
	import { goto } from '$app/navigation';
	import { signIn, signUp, supabase } from '$lib/services/auth';

	let mode = $state<'home' | 'for-reps' | 'for-brands' | 'login' | 'signup'>('home');
	let email = $state('');
	let password = $state('');
	let authError = $state('');
	let loading = $state(false);

	async function getPostLoginRoute(userId: string): Promise<string> {
		// Check if this user is a team member (SDR or portal/client user)
		const { data } = await supabase
			.from('team_members')
			.select('role, portal_access')
			.eq('user_id', userId)
			.maybeSingle();

		if (!data) return '/dashboard'; // owner / admin
		if (data.portal_access === true) return '/client-portal';
		if (data.role === 'sdr') return '/sdr';
		return '/dashboard';
	}

	async function handleAuth(e: Event) {
		e.preventDefault();
		authError = '';
		loading = true;
		try {
			if (mode === 'login') {
				const session = await signIn(email, password);
				const route = await getPostLoginRoute(session.user.id);
				await goto(route);
			} else {
				await signUp(email, password);
				await goto('/onboarding');
			}
		} catch (err: unknown) {
			authError = err instanceof Error ? err.message : 'Something went wrong';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>LeadOS — Outreach For All</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

	<!-- Slim top nav -->
	<nav class="flex items-center justify-between px-10 py-6">
		<span style="font-family:var(--font-label);font-size:13px;letter-spacing:.28em;color:#333">LEADOS</span>
		<div class="flex items-center gap-5">
			<a href="/marketplace" class="text-xs text-[#444] hover:text-white transition-colors">Find Reps</a>
			<a href="/pricing" class="text-xs text-[#444] hover:text-white transition-colors">Pricing</a>
			<a href="/coaching" class="text-xs text-[#444] hover:text-white transition-colors">Coaching</a>
			<a href="/about" class="text-xs text-[#444] hover:text-white transition-colors">About</a>
			<a href="/join" class="text-xs text-[#444] hover:text-white transition-colors">Join as Rep</a>
			<a href="/contact" class="text-xs text-[#444] hover:text-white transition-colors">Hire SDRs</a>
			<button onclick={() => { mode = 'login'; authError = ''; }}
				class="text-xs text-[#444] hover:text-white transition-colors">
				Log in →
			</button>
		</div>
	</nav>

	{#if mode === 'home'}

		<!-- Animated grid background -->
		<div class="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true" style="z-index:0">
			<div class="hero-grid"></div>
		</div>

		<!-- Hero — full viewport centered -->
		<div class="flex-1 flex flex-col items-center justify-center px-8 text-center relative" style="z-index:1">
			<h1 class="hero-title" style="font-family:var(--font-display);font-weight:300;font-size:clamp(4rem,14vw,11rem);letter-spacing:-.02em;line-height:.92;color:#fff;margin-bottom:1.5rem">
				LeadOS
			</h1>
			<p class="hero-sub" style="font-family:var(--font-label);font-size:clamp(.65rem,1.5vw,1rem);letter-spacing:.3em;color:#333;margin-bottom:5rem">
				OUTREACH FOR ALL
	