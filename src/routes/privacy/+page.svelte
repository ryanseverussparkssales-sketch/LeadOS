<svelte:head>
	<title>Privacy Policy — LeadOS</title>
	<meta name="description" content="Privacy Policy for LeadOS and Sparks Curiosity Studio. How we collect, use, and protect your data." />
</svelte:head>

<div class="min-h-screen bg-[#000] text-white" style="font-family:var(--font-ui,'Inter',system-ui,sans-serif)">
	<nav class="flex items-center justify-between px-8 py-6 border-b border-[#0f0f0f]">
		<a href="/" style="font-family:var(--font-label,'Cormorant SC',serif);font-size:14px;letter-spacing:.28em;color:#fff">LEADOS</a>
		<a href="/terms" class="text-xs text-[#444] hover:text-white transition-colors">Terms of Service</a>
	</nav>

	<div class="max-w-3xl mx-auto px-8 py-16">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#333;margin-bottom:12px">Legal</p>
		<h1 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:36px;color:#fff;margin-bottom:8px">Privacy Policy</h1>
		<p class="text-xs text-[#444] mb-12">Last updated: June 2026 · Sparks Curiosity Studio LLC</p>

		<div style="font-size:13px;color:#888;line-height:1.8">

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">1. What We Collect</h2>
			<p style="margin-bottom:12px"><strong style="color:#ccc">Account data:</strong> Name, email, and password when you register.</p>
			<p style="margin-bottom:12px"><strong style="color:#ccc">Contact data:</strong> Business contact information you import (names, phone numbers, emails, companies). You own this data; we process it on your behalf.</p>
			<p style="margin-bottom:12px"><strong style="color:#ccc">Call data:</strong> Call recordings, transcripts, and outcomes generated through the Platform. Recordings are stored in Supabase Storage and Twilio infrastructure.</p>
			<p style="margin-bottom:12px"><strong style="color:#ccc">Usage data:</strong> Log data, page visits, and feature usage to improve the Platform.</p>
			<p><strong style="color:#ccc">Payment data:</strong> Payment is processed by Stripe. We do not store card numbers. Rep payouts are handled via Stripe Connect.</p>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">2. How We Use It</h2>
			<p>We use your data to: provide the Platform; process payments; send transactional emails (appointment confirmations, weekly reports); provide AI-powered coaching and call analysis; and improve the Platform. We do not sell your data to third parties or use it for advertising.</p>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">3. Call Recordings</h2>
			<p>Calls made through the Platform may be recorded. The Platform automatically announces recording at the start of outbound calls. Recordings are stored securely, accessible only to authorized users in your account, and deleted upon account termination unless otherwise required by law.</p>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">4. Third-Party Services</h2>
			<p style="margin-bottom:8px">We use the following sub-processors:</p>
			<ul style="list-style:none;padding:0;space-y:6px">
				{#each ['Supabase (database & auth) — supabase.com/privacy','Twilio (voice & SMS) — twilio.com/legal/privacy','Stripe (payments) — stripe.com/privacy','Resend (email) — resend.com/privacy','Anthropic (AI analysis) — anthropic.com/privacy','Vercel (hosting) — vercel.com/legal/privacy-policy'] as sp}
					<li style="padding:4px 0;border-bottom:1px solid #111;font-size:11px;color:#555">{sp}</li>
				{/each}
			</ul>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">5. Your Rights</h2>
			<p>You may request access, correction, or deletion of your personal data at any time by contacting us. EU/UK users have additional rights under GDPR. California users have rights under CCPA. We will respond within 30 days.</p>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">6. Data Retention</h2>
			<p>We retain account data for the duration of your subscription plus 90 days after termination. Call recordings are retained for 12 months by default. Contact data is deleted upon request or account termination.</p>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">7. Security</h2>
			<p>We use industry-standard encryption in transit (TLS) and at rest. Access is controlled by role-based authentication. We conduct periodic security reviews.</p>

			<h2 style="font-size:15px;font-weight:500;color:#fff;margin:28px 0 10px">8. Contact</h2>
			<p>Privacy requests: <a href="mailto:ryanseverussparkssales@gmail.com" style="color:#888;text-decoration:underline">ryanseverussparkssales@gmail.com</a></p>
		</div>
	</div>

	<div class="border-t border-[#0a0a0a] px-8 py-6 flex items-center justify-between max-w-5xl mx-auto">
		<span style="font-family:var(--font-label,'Cormorant SC',serif);font-size:11px;letter-spacing:.22em;color:#222">LEADOS</span>
		<div class="flex gap-6 text-[10px] text-[#2a2a2a]">
			<a href="/terms" class="hover:text-white transition-colors">Terms</a>
			<a href="/privacy" class="hover:text-white transition-colors">Privacy</a>
			<a href="/contact" class="hover:text-white transition-colors">Contact</a>
		</div>
	</div>
</div>
