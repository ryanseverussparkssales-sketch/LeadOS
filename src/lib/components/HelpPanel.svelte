<script lang="ts">
	import { onMount } from 'svelte';
	import { BRAND } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';

	let open = $state(false);
	let twilioStatus = $state<'ok' | 'checking' | 'error'>('checking');
	let supabaseStatus = $state<'ok' | 'checking' | 'error'>('checking');

	const ISSUES = [
		{
			problem: "Can't make calls / dialer not connecting",
			fix: "Go to Settings → Connections and verify your Twilio Account SID, API Key, and TwiML App SID are set. Also check that your phone number is provisioned in /numbers.",
			href: '/settings#connections',
			icon: '📞',
		},
		{
			problem: "Contacts not loading",
			fix: "Try refreshing the page. If it persists, check your internet connection. Your data is safe — this is usually a temporary connection issue.",
			href: null,
			icon: '👥',
		},
		{
			problem: "Getting logged out unexpectedly",
			fix: "This usually means your session expired. Click Sign In below to restore your session without losing your work.",
			href: '/auth',
			icon: '🔑',
		},
		{
			problem: "SMS not sending",
			fix: "Verify your Twilio number has SMS enabled in /numbers. Also check that the destination number is a valid US mobile number.",
			href: '/numbers',
			icon: '💬',
		},
		{
			problem: "Email not sending",
			fix: "Go to Settings → Email Accounts and verify your Gmail or SMTP credentials. Check the 'Test connection' button.",
			href: '/settings#email-accounts',
			icon: '✉️',
		},
		{
			problem: "Recordings or transcripts missing",
			fix: "Transcription takes 30–90 seconds after a call ends. If it's been longer, check that GROQ_API_KEY is set in your Vercel environment variables.",
			href: null,
			icon: '🎙️',
		},
	];

	onMount(async () => {
		// Check system status
		try {
			const r = await apiFetch('/api/health');
			supabaseStatus = r.ok ? 'ok' : 'error';
		} catch {
			supabaseStatus = 'error';
		}
		twilioStatus = 'ok'; // Twilio status is confirmed via call capability, not polled here

		const helpHandler = () => { open = true; };
		window.addEventListener('leados:help', helpHandler);
		return () => window.removeEventListener('leados:help', helpHandler);
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex justify-end">
		<div class="absolute inset-0 bg-black/50" onclick={() => open = false} role="presentation"></div>
		<div class="relative w-96 bg-[#0d0d0d] border-l border-[#1e1e1e] flex flex-col h-full shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e]">
				<p class="text-white font-semibold text-sm">Help & Support</p>
				<button onclick={() => open = false} class="text-[#7c7c7c] hover:text-white text-lg leading-none"><Icon name="x" size={14} /></button>
			</div>

			<!-- Status indicators -->
			<div class="px-5 py-3 border-b border-[#1e1e1e]">
				<p class="text-[10px] text-[#6e6e6e] uppercase tracking-widest mb-2">System Status</p>
				<div class="flex gap-4">
					<div class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full {supabaseStatus === 'ok' ? 'bg-[var(--accent)]' : supabaseStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}"></span>
						<span class="text-xs text-[#8a8a8a]">Database</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full bg-[var(--accent)]"></span>
						<span class="text-xs text-[#8a8a8a]">API</span>
					</div>
				</div>
			</div>

			<!-- Troubleshooting -->
			<div class="flex-1 overflow-y-auto px-5 py-4">
				<p class="text-[10px] text-[#6e6e6e] uppercase tracking-widest mb-3">Common Issues</p>
				<div class="space-y-2">
					{#each ISSUES as issue}
						<details class="group rounded-xl border border-[#1a1a1a] bg-[#111]">
							<summary class="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
								<span class="text-base flex-shrink-0">{issue.icon}</span>
								<p class="text-xs text-[#888] group-open:text-white transition-colors flex-1">{issue.problem}</p>
								<span class="text-[#333] text-xs group-open:rotate-180 transition-transform">▼</span>
							</summary>
							<div class="px-4 pb-3">
								<p class="text-xs text-[#7c7c7c] leading-relaxed mb-2">{issue.fix}</p>
								{#if issue.href}
									<a href={issue.href} onclick={() => open = false}
										class="text-xs text-white underline hover:no-underline">
										Go to {issue.href.replace('/settings#', 'Settings → ').replace('/', '')} →
									</a>
								{/if}
							</div>
						</details>
					{/each}
				</div>

				<!-- Quick actions -->
				<p class="text-[10px] text-[#6e6e6e] uppercase tracking-widest mt-5 mb-3">Quick Actions</p>
				<div class="space-y-2">
					<button onclick={() => window.location.reload()}
						class="w-full text-left px-4 py-3 rounded-xl border border-[#1a1a1a] bg-[#111] text-xs text-[#8a8a8a] hover:text-white hover:border-[#333] transition-colors">
						🔄 Refresh the page
					</button>
					<button onclick={() => { localStorage.clear(); window.location.href = '/'; }}
						class="w-full text-left px-4 py-3 rounded-xl border border-[#1a1a1a] bg-[#111] text-xs text-[#8a8a8a] hover:text-white hover:border-[#333] transition-colors">
						🗑 Clear cache and reload
					</button>
					<a href="mailto:support@sparkscuriositystudio.com"
						class="block px-4 py-3 rounded-xl border border-[#1a1a1a] bg-[#111] text-xs text-[#8a8a8a] hover:text-white hover:border-[#333] transition-colors">
						✉ Email support
					</a>
				</div>
			</div>

			<!-- Footer -->
			<div class="px-5 py-3 border-t border-[#1e1e1e]">
				<p class="text-[10px] text-[#333]">Press ? to open this panel · Version: {BRAND} MVP</p>
			</div>
		</div>
	</div>
{/if}
