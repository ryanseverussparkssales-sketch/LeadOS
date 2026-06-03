<script lang="ts">
	import { page } from '$app/stores';

	const token = $derived($page.params.token);

	let name = $state('');
	let phone = $state('');
	let email = $state('');
	let company = $state('');

	let submitting = $state(false);
	let submitted = $state(false);
	let error = $state('');

	// Read UTM params from the embedding page URL (passed via query string)
	const utmSource = $derived($page.url.searchParams.get('utm_source') ?? '');
	const utmMedium = $derived($page.url.searchParams.get('utm_medium') ?? '');
	const utmCampaign = $derived($page.url.searchParams.get('utm_campaign') ?? '');

	// Theme from query param: ?theme=dark|light (default: dark)
	const theme = $derived($page.url.searchParams.get('theme') ?? 'dark');
	const isDark = $derived(theme !== 'light');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!name.trim() && !phone.trim() && !email.trim()) {
			error = 'Please fill in at least one field.';
			return;
		}
		submitting = true;
		error = '';

		try {
			const res = await fetch(`/api/webhook/${token}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name || undefined,
					phone: phone || undefined,
					email: email || undefined,
					company: company || undefined,
					utm_source: utmSource || undefined,
					utm_medium: utmMedium || undefined,
					utm_campaign: utmCampaign || undefined,
					source: 'embedded_form',
				}),
			});

			if (res.ok) {
				submitted = true;
			} else {
				const d = await res.json().catch(() => ({}));
				error = d.message ?? d.error ?? 'Something went wrong. Please try again.';
			}
		} catch {
			error = 'Network error. Please try again.';
		}
		submitting = false;
	}
</script>

<svelte:head>
	<title>Contact Form</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div style="
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: {isDark ? '#111111' : '#ffffff'};
	color: {isDark ? '#e5e5e5' : '#111111'};
	border-radius: 12px;
	border: 1px solid {isDark ? '#2a2a2a' : '#e5e5e5'};
	padding: 24px;
	max-width: 480px;
	margin: 0 auto;
">
	{#if submitted}
		<div style="text-align: center; padding: 32px 0;">
			<p style="font-size: 32px; margin-bottom: 12px;">✓</p>
			<p style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Got it!</p>
			<p style="font-size: 13px; color: {isDark ? '#666' : '#888'};">We'll be in touch soon.</p>
		</div>
	{:else}
		<form onsubmit={handleSubmit} style="display: flex; flex-direction: column; gap: 14px;">
			<div>
				<label style="display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {isDark ? '#888' : '#666'}; margin-bottom: 6px;">Name</label>
				<input bind:value={name} placeholder="Your name" style="
					width: 100%; box-sizing: border-box;
					border-radius: 8px; border: 1px solid {isDark ? '#2a2a2a' : '#e5e5e5'};
					background: {isDark ? '#1a1a1a' : '#f9f9f9'};
					color: {isDark ? '#fff' : '#111'};
					padding: 10px 14px; font-size: 14px; outline: none;
				" />
			</div>
			<div>
				<label style="display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {isDark ? '#888' : '#666'}; margin-bottom: 6px;">Phone</label>
				<input bind:value={phone} placeholder="+1 555 000 0000" type="tel" style="
					width: 100%; box-sizing: border-box;
					border-radius: 8px; border: 1px solid {isDark ? '#2a2a2a' : '#e5e5e5'};
					background: {isDark ? '#1a1a1a' : '#f9f9f9'};
					color: {isDark ? '#fff' : '#111'};
					padding: 10px 14px; font-size: 14px; outline: none;
				" />
			</div>
			<div>
				<label style="display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {isDark ? '#888' : '#666'}; margin-bottom: 6px;">Email</label>
				<input bind:value={email} placeholder="you@company.com" type="email" style="
					width: 100%; box-sizing: border-box;
					border-radius: 8px; border: 1px solid {isDark ? '#2a2a2a' : '#e5e5e5'};
					background: {isDark ? '#1a1a1a' : '#f9f9f9'};
					color: {isDark ? '#fff' : '#111'};
					padding: 10px 14px; font-size: 14px; outline: none;
				" />
			</div>
			<div>
				<label style="display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {isDark ? '#888' : '#666'}; margin-bottom: 6px;">Company</label>
				<input bind:value={company} placeholder="Acme Corp" style="
					width: 100%; box-sizing: border-box;
					border-radius: 8px; border: 1px solid {isDark ? '#2a2a2a' : '#e5e5e5'};
					background: {isDark ? '#1a1a1a' : '#f9f9f9'};
					color: {isDark ? '#fff' : '#111'};
					padding: 10px 14px; font-size: 14px; outline: none;
				" />
			</div>

			{#if error}
				<p style="font-size: 13px; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 10px 14px;">{error}</p>
			{/if}

			<button type="submit" disabled={submitting} style="
				border-radius: 8px; background: {isDark ? '#ffffff' : '#111111'};
				color: {isDark ? '#000000' : '#ffffff'};
				border: none; padding: 12px 24px; font-size: 14px; font-weight: 600;
				cursor: {submitting ? 'not-allowed' : 'pointer'};
				opacity: {submitting ? '0.6' : '1'};
				width: 100%;
			">
				{submitting ? 'Sending…' : 'Submit'}
			</button>
		</form>
	{/if}
</div>
