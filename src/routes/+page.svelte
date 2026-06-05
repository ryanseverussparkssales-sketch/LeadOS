<script lang="ts">
	import { goto } from '$app/navigation';
	import { signIn, signUp, supabase } from '$lib/services/auth';

	let mode = $state<'home' | 'for-reps' | 'for-brands' | 'login' | 'signup'>('home');
	let email = $state('');
	let password = $state('');
	let authError = $state('');
	let loading = $state(false);

	async function getPostLoginRoute(userId: string): Promise<string> {
		const { data } = await supabase
			.from('team_members')
			.select('role, portal_access')
			.eq('user_id', userId)
			.maybeSingle();

		if (!data) return '/dashboard';
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

<svelte:head><title>EdelhausOS — Outreach For All</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

	<!-- Slim top nav -->
	<nav class="flex items-center justify-between px-10 py-6">
		<span style="font-family:var(--font-label);font-size:13px;letter-spacing:.28em;color:#777">EDELHAUS<span style="color:var(--call)">OS</span></span>
		<div class="flex items-center gap-5">
			<a href="/pricing" class="text-xs text-[#666] hover:text-white transition-colors">Pricing</a>
			<a href="/about" class="text-xs text-[#666] hover:text-white transition-colors">About</a>
			<a href="/contact" class="text-xs text-[#666] hover:text-white transition-colors">Hire SDRs</a>
			<button onclick={() => { mode = 'login'; authError = ''; }}
				class="text-xs text-[#666] hover:text-white transition-colors">
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
				Edelhaus<span style="font-size:.34em;color:var(--call);vertical-align:0.62em;letter-spacing:.02em;font-weight:400">OS</span>
			</h1>
			<p class="hero-sub" style="font-family:var(--font-label);font-size:clamp(.65rem,1.5vw,1rem);letter-spacing:.3em;color:#666;margin-bottom:5rem">
				OUTREACH FOR ALL
			</p>
			<div class="flex items-center gap-6">
				<button
					onclick={() => { mode = 'signup'; authError = ''; }}
					class="px-8 py-3 bg-white text-black text-xs font-medium hover:bg-[#e0e0e0] transition-colors"
					style="font-family:var(--font-label);letter-spacing:.2em">
					GET STARTED
				</button>
				<button
					onclick={() => { mode = 'login'; authError = ''; }}
					class="px-8 py-3 border border-[#262626] text-[#666] text-xs hover:border-[#444] hover:text-white transition-colors"
					style="font-family:var(--font-label);letter-spacing:.2em">
					SIGN IN
				</button>
			</div>
		</div>

	{:else if mode === 'login' || mode === 'signup'}

		<!-- Auth form -->
		<div class="flex-1 flex items-center justify-center px-8">
			<div class="w-full max-w-sm">
				<p class="mb-8 text-center" style="font-family:var(--font-label);font-size:11px;letter-spacing:.3em;color:#444">
					{mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
				</p>

				<form onsubmit={handleAuth} class="flex flex-col gap-4">
					<input
						type="email"
						placeholder="Email"
						bind:value={email}
						required
						class="w-full bg-transparent border border-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#333] focus:border-[#333] focus:outline-none transition-colors"
					/>
					<input
						type="password"
						placeholder="Password"
						bind:value={password}
						required
						class="w-full bg-transparent border border-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#333] focus:border-[#333] focus:outline-none transition-colors"
					/>

					{#if authError}
						<p class="text-xs text-red-400">{authError}</p>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="w-full py-3 bg-white text-black text-xs font-medium disabled:opacity-40 hover:bg-[#e0e0e0] transition-colors mt-2"
						style="font-family:var(--font-label);letter-spacing:.2em">
						{loading ? 'PLEASE WAIT…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
					</button>
				</form>

				<div class="mt-6 text-center flex flex-col gap-3">
					{#if mode === 'login'}
						<button
							onclick={() => { mode = 'signup'; authError = ''; email = ''; password = ''; }}
							class="text-xs text-[#333] hover:text-[#666] transition-colors">
							No account? Sign up →
						</button>
					{:else}
						<button
							onclick={() => { mode = 'login'; authError = ''; email = ''; password = ''; }}
							class="text-xs text-[#333] hover:text-[#666] transition-colors">
							Already have an account? Sign in →
						</button>
					{/if}
					<button
						onclick={() => { mode = 'home'; authError = ''; }}
						class="text-xs text-[#222] hover:text-[#444] transition-colors">
						← Back
					</button>
				</div>
			</div>
		</div>

	{/if}

</div>

<style>
	.hero-grid {
		width: 100%;
		height: 100%;
		background-image:
			linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
		background-size: 80px 80px;
		mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%);
		-webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%);
	}
</style>
