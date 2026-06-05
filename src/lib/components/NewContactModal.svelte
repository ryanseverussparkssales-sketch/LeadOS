<script lang="ts">
	import { apiFetch } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';

	let { onClose, onCreated, leadSource = '' }: {
		onClose: () => void;
		onCreated: () => void;
		leadSource?: string;
	} = $props();

	let name = $state('');
	let phone = $state('');
	let email = $state('');
	let company = $state('');
	let title = $state('');
	let source = $state('manual');
	let saving = $state(false);
	let error = $state('');

	const canSubmit = $derived(
		name.trim().length > 0 &&
		(phone.trim().length > 0 || email.trim().length > 0 || company.trim().length > 0)
	);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!phone.trim() && !email.trim() && !company.trim()) { error = 'Phone, email, or company is required'; return; }
		saving = true;
		error = '';
		try {
			const res = await apiFetch('/api/contacts/create', {
				method: 'POST',
				body: JSON.stringify({ name, phone, email, company, title, lead_source: leadSource || source || 'manual' }),
			});
			if (res.status === 409) {
				error = 'A contact with this phone number already exists';
				return;
			}
			if (!res.ok) {
				const d = await res.json();
				error = d.message || 'Failed to create contact';
				return;
			}
			onCreated();
			onClose();
		} catch {
			error = 'Something went wrong';
		} finally {
			saving = false;
		}
	}
</script>

<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
	onclick={onClose} role="dialog" aria-modal="true">
	<div class="bg-[#111111] border border-[#2a2a2a] rounded-xl w-[480px]"
		onclick={(e) => e.stopPropagation()}>

		<div class="p-5 border-b border-[#2a2a2a] flex items-center justify-between">
			<p class="text-white text-sm font-medium">New Contact</p>
			<button onclick={onClose} class="text-[#666] hover:text-white transition-colors"><Icon name="x" size={14} /></button>
		</div>

		<form onsubmit={handleSubmit} class="p-5 space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Name</label>
					<input bind:value={name} placeholder="Full name (optional)"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					<p class="text-xs text-[#444] mt-1">Phone, email, or company required</p>
				</div>
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Phone</label>
					<input bind:value={phone} placeholder="+1 555 000 0000"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
			</div>

			<div>
				<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Company</label>
				<input bind:value={company} placeholder="Acme Corp"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Title</label>
					<input bind:value={title} placeholder="VP of Sales"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Email</label>
					<input bind:value={email} type="email" placeholder="name@company.com"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
			</div>

			{#if !leadSource}
			<div>
				<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Source</label>
				<select bind:value={source} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
					<option value="manual">Manual Entry</option>
					<option value="referral">Referral</option>
					<option value="website">Website</option>
					<option value="linkedin">LinkedIn</option>
					<option value="facebook">Facebook</option>
					<option value="cold_outreach">Cold Outreach</option>
					<option value="event">Event</option>
					<option value="other">Other</option>
				</select>
			</div>
			{/if}

			{#if error}
				<p class="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-2">{error}</p>
			{/if}

			<div class="flex gap-3 pt-1">
				<button type="button" onclick={onClose}
					class="flex-1 rounded-lg border border-[#2a2a2a] py-2.5 text-sm text-[#666] hover:text-white hover:border-white transition-colors">
					Cancel
				</button>
				<button type="submit" disabled={saving || !canSubmit}
					class="flex-1 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
					{saving ? 'Creating...' : 'Create Contact'}
				</button>
			</div>
		</form>
	</div>
</div>
