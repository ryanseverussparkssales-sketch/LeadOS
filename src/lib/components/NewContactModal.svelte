<script lang="ts">
	import { apiFetch } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import { contactSchema, flattenErrors } from '$lib/schemas';

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
	let notes = $state('');
	let source = $state('manual');
	let saving = $state(false);
	let error = $state('');
	// Per-field validation errors, keyed by schema field name.
	let fieldErrors = $state<Record<string, string>>({});

	const canSubmit = $derived(
		name.trim().length > 0 &&
		(phone.trim().length > 0 || email.trim().length > 0 || company.trim().length > 0)
	);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		fieldErrors = {};

		// Client-side validation via the shared contact schema.
		const parsed = contactSchema.safeParse({
			name,
			email: email.trim(),
			phone,
			company,
			title,
			notes,
		});
		if (!parsed.success) {
			fieldErrors = flattenErrors(parsed.error);
			return;
		}
		// The create endpoint requires at least one contact channel.
		if (!phone.trim() && !email.trim() && !company.trim()) {
			error = 'Phone, email, or company is required';
			return;
		}

		saving = true;
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
			<button onclick={onClose} class="text-[#8a8a8a] hover:text-white transition-colors"><Icon name="x" size={14} /></button>
		</div>

		<form onsubmit={handleSubmit} class="p-5 space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<FormField label="Name" required error={fieldErrors.name} hint="Phone, email, or company required">
					{#snippet children({ id, describedBy })}
						<input bind:value={name} placeholder="Full name" {id} aria-describedby={describedBy}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					{/snippet}
				</FormField>
				<FormField label="Phone" error={fieldErrors.phone}>
					{#snippet children({ id, describedBy })}
						<input bind:value={phone} placeholder="+1 555 000 0000" {id} aria-describedby={describedBy}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					{/snippet}
				</FormField>
			</div>

			<FormField label="Company" error={fieldErrors.company}>
				{#snippet children({ id, describedBy })}
					<input bind:value={company} placeholder="Acme Corp" {id} aria-describedby={describedBy}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				{/snippet}
			</FormField>

			<div class="grid grid-cols-2 gap-4">
				<FormField label="Title" error={fieldErrors.title}>
					{#snippet children({ id, describedBy })}
						<input bind:value={title} placeholder="VP of Sales" {id} aria-describedby={describedBy}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					{/snippet}
				</FormField>
				<FormField label="Email" error={fieldErrors.email}>
					{#snippet children({ id, describedBy })}
						<input bind:value={email} type="email" placeholder="name@company.com" {id} aria-describedby={describedBy}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					{/snippet}
				</FormField>
			</div>

			<FormField label="Notes" error={fieldErrors.notes}>
				{#snippet children({ id, describedBy })}
					<textarea bind:value={notes} placeholder="Context, next steps…" rows="2" {id} aria-describedby={describedBy}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
				{/snippet}
			</FormField>

			{#if !leadSource}
			<FormField label="Source">
				{#snippet children({ id, describedBy })}
					<select bind:value={source} {id} aria-describedby={describedBy} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
						<option value="manual">Manual Entry</option>
						<option value="referral">Referral</option>
						<option value="website">Website</option>
						<option value="linkedin">LinkedIn</option>
						<option value="facebook">Facebook</option>
						<option value="cold_outreach">Cold Outreach</option>
						<option value="event">Event</option>
						<option value="other">Other</option>
					</select>
				{/snippet}
			</FormField>
			{/if}

			{#if error}
				<p class="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-2">{error}</p>
			{/if}

			<div class="flex gap-3 pt-1">
				<button type="button" onclick={onClose}
					class="flex-1 rounded-lg border border-[#2a2a2a] py-2.5 text-sm text-[#8a8a8a] hover:text-white hover:border-white transition-colors">
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
